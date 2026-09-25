"""
ai_inference.py — Ocean067 AI temperature inference
====================================================

Loads the trained PyTorch model, feature/target scalers, and
model config **once** at import time.  Exposes three FastAPI
routes that are registered on the main app via `register_ai_routes`.

Routes
------
GET  /api/ai/health
POST /api/ai/predict-temperature
POST /api/ai/anomaly
"""

from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger("ai_inference")

# ---------------------------------------------------------------------------
# Resolve model directory
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent

# Env-override or default to Ocean067_AI/GPU_Temperature_Model relative to repo root
_DEFAULT_MODEL_DIR = _ROOT / "Ocean067_AI" / "GPU_Temperature_Model"
AI_MODEL_DIR = Path(os.getenv("OCEAN067_AI_MODEL_DIR", str(_DEFAULT_MODEL_DIR)))

# ---------------------------------------------------------------------------
# Lazy-loaded singletons (populated by _load_model())
# ---------------------------------------------------------------------------
_model       = None          # torch.nn.Module
_feat_scaler = None          # sklearn scaler
_tgt_scaler  = None          # sklearn scaler
_model_cfg   : dict  = {}
_anomaly_thr : float = 2.0   # fallback; overwritten from config
_load_error  : Optional[str] = None
_device      = None          # torch.device


_model_load_attempted: bool = False  # set True after first attempt


def _load_model() -> None:
    """Load model artifacts exactly once.  Errors are captured in _load_error."""
    global _model, _feat_scaler, _tgt_scaler, _model_cfg, _anomaly_thr, _device, _load_error, _model_load_attempted

    if _model_load_attempted:
        return
    _model_load_attempted = True

    try:
        import torch
        import torch.nn as nn
        import joblib

        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"[AI] Using device: {_device}")

        # Validate required files
        required = [
            "best_model_weights.pt",
            "feature_scaler.joblib",
            "target_scaler.joblib",
            "model_config.json",
        ]
        missing = [f for f in required if not (AI_MODEL_DIR / f).exists()]
        if missing:
            raise FileNotFoundError(
                f"Missing model files in {AI_MODEL_DIR}: {missing}"
            )

        # Load config
        with open(AI_MODEL_DIR / "model_config.json") as fh:
            _model_cfg = json.load(fh)
        _anomaly_thr = float(_model_cfg.get("anomaly_threshold_C", 2.0))
        logger.info(f"[AI] Anomaly threshold: {_anomaly_thr:.4f} °C")

        # Define model architecture (mirrors training code exactly)
        class OceanTemperatureModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.network = nn.Sequential(
                    nn.Linear(14, 256),
                    nn.BatchNorm1d(256),
                    nn.ReLU(),
                    nn.Dropout(0.15),
                    nn.Linear(256, 128),
                    nn.BatchNorm1d(128),
                    nn.ReLU(),
                    nn.Dropout(0.15),
                    nn.Linear(128, 64),
                    nn.ReLU(),
                    nn.Linear(64, 32),
                    nn.ReLU(),
                    nn.Linear(32, 1),
                )

            def forward(self, x):
                return self.network(x)

        net = OceanTemperatureModel().to(_device)
        net.load_state_dict(
            torch.load(
                AI_MODEL_DIR / "best_model_weights.pt",
                map_location=_device,
                weights_only=True,
            )
        )
        net.eval()
        _model = net
        logger.info("[AI] Model weights loaded.")

        _feat_scaler = joblib.load(AI_MODEL_DIR / "feature_scaler.joblib")
        _tgt_scaler  = joblib.load(AI_MODEL_DIR / "target_scaler.joblib")
        logger.info("[AI] Scalers loaded.")

    except Exception as exc:
        _load_error = str(exc)
        logger.error(f"[AI] Model load failed: {exc}")


# Run in a daemon background thread so import does NOT block server startup.
# The /api/ai/health endpoint reports "loading" until the thread finishes.
import threading as _threading
_model_load_thread = _threading.Thread(target=_load_model, daemon=True, name="ai-model-load")
_model_load_thread.start()


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def _build_features(
    latitude: float,
    longitude: float,
    pressure_dbar: float,
    salinity_psu: float,
    date_iso: str,
) -> np.ndarray:
    """Reconstruct the exact 14 training features."""
    dt = datetime.fromisoformat(date_iso.replace("Z", "+00:00"))

    # Normalise longitude to [-180, 180)
    longitude = ((longitude + 180.0) % 360.0) - 180.0
    # Pressure / depth must be non-negative
    pressure_dbar = max(float(pressure_dbar), 0.0)

    doy = dt.timetuple().tm_yday

    features = np.array([[
        latitude,                                    # latitude
        longitude,                                   # longitude
        pressure_dbar,                               # pressure_dbar
        math.log1p(pressure_dbar),                   # log_depth
        salinity_psu,                                # salinity_PSU
        float(dt.year),                              # year
        float(dt.month),                             # month
        float(doy),                                  # day_of_year
        math.sin(2.0 * math.pi * doy / 365.25),     # sin_doy
        math.cos(2.0 * math.pi * doy / 365.25),     # cos_doy
        math.sin(math.radians(longitude)),           # sin_lon
        math.cos(math.radians(longitude)),           # cos_lon
        math.sin(math.radians(latitude)),            # sin_lat
        math.cos(math.radians(latitude)),            # cos_lat
    ]], dtype=np.float32)

    return features


def predict_temperature(
    latitude: float,
    longitude: float,
    pressure_dbar: float,
    salinity_psu: float,
    date_iso: str,
) -> float:
    """Return predicted temperature (°C)."""
    if _model is None:
        raise RuntimeError(f"Model not loaded: {_load_error}")

    import torch

    features = _build_features(latitude, longitude, pressure_dbar, salinity_psu, date_iso)
    X = _feat_scaler.transform(features)

    with torch.no_grad():
        y_scaled = _model(
            torch.tensor(X, dtype=torch.float32, device=_device)
        ).cpu().numpy()

    temp = float(_tgt_scaler.inverse_transform(y_scaled)[0, 0])
    return round(temp, 4)


def predict_temperatures_batch(
    lats: np.ndarray,
    lons: np.ndarray,
    pressure_dbar: float,
    salinities: np.ndarray,
    date_iso: str,
) -> np.ndarray:
    """Return array of predicted temperatures (°C) for a batch of points in one forward pass."""
    if _model is None:
        raise RuntimeError(f"Model not loaded: {_load_error}")

    import torch

    dt = datetime.fromisoformat(date_iso.replace("Z", "+00:00"))
    lons_norm = ((lons + 180.0) % 360.0) - 180.0
    p = max(float(pressure_dbar), 0.0)
    log_p = math.log1p(p)
    doy = float(dt.timetuple().tm_yday)
    sin_doy = math.sin(2.0 * math.pi * doy / 365.25)
    cos_doy = math.cos(2.0 * math.pi * doy / 365.25)
    year = float(dt.year)
    month = float(dt.month)

    rad_lon = np.radians(lons_norm)
    rad_lat = np.radians(lats)

    N = len(lats)
    X_raw = np.column_stack([
        lats.astype(np.float32),
        lons_norm.astype(np.float32),
        np.full(N, p, dtype=np.float32),
        np.full(N, log_p, dtype=np.float32),
        salinities.astype(np.float32),
        np.full(N, year, dtype=np.float32),
        np.full(N, month, dtype=np.float32),
        np.full(N, doy, dtype=np.float32),
        np.full(N, sin_doy, dtype=np.float32),
        np.full(N, cos_doy, dtype=np.float32),
        np.sin(rad_lon).astype(np.float32),
        np.cos(rad_lon).astype(np.float32),
        np.sin(rad_lat).astype(np.float32),
        np.cos(rad_lat).astype(np.float32),
    ]).astype(np.float32)

    X = _feat_scaler.transform(X_raw)

    with torch.no_grad():
        y_scaled = _model(
            torch.tensor(X, dtype=torch.float32, device=_device)
        ).cpu().numpy()

    return _tgt_scaler.inverse_transform(y_scaled).ravel()


# ---------------------------------------------------------------------------
# FastAPI route definitions
# ---------------------------------------------------------------------------

def register_ai_routes(app) -> None:
    """Attach /api/ai/* routes to an existing FastAPI app instance."""
    from fastapi import HTTPException
    from pydantic import BaseModel, Field

    # ── Request / Response schemas ──────────────────────────────────────────

    class PredictRequest(BaseModel):
        latitude:      float = Field(..., ge=-90,  le=90,   description="Decimal degrees N")
        longitude:     float = Field(..., ge=-180, le=180,  description="Decimal degrees E")
        pressure_dbar: float = Field(..., ge=0,              description="Depth proxy in dbar (≈ metres)")
        salinity_psu:  float = Field(..., ge=0,   le=45,    description="Practical Salinity Units")
        date:          str   = Field(...,                    description="ISO-8601 date/datetime string")

    class PredictResponse(BaseModel):
        predicted_temperature_C: float
        latitude:      float
        longitude:     float
        pressure_dbar: float
        salinity_psu:  float
        date:          str

    class AnomalyRequest(BaseModel):
        latitude:             float = Field(..., ge=-90,  le=90)
        longitude:            float = Field(..., ge=-180, le=180)
        pressure_dbar:        float = Field(..., ge=0)
        salinity_psu:         float = Field(..., ge=0, le=45)
        date:                 str
        observed_temperature: float = Field(..., description="Measured temperature in °C")

    class AnomalyResponse(BaseModel):
        predicted_temperature_C:  float
        observed_temperature_C:   float
        anomaly_C:                float   # observed − predicted
        absolute_anomaly_C:       float
        anomaly_score:            float   # |anomaly| / threshold
        is_anomaly:               bool
        direction:                str     # "warmer" | "colder" | "normal"
        anomaly_threshold_C:      float

    # ── Endpoints ───────────────────────────────────────────────────────────

    @app.get(
        "/api/ai/health",
        tags=["AI"],
        summary="AI model health check",
    )
    def ai_health():
        """Returns model load status and basic metadata."""
        ready = _model is not None
        loading = _model_load_thread.is_alive() if hasattr(_model_load_thread, "is_alive") else False
        if ready:
            status = "ready"
        elif loading:
            status = "loading"
        else:
            status = "unavailable"
        return {
            "status":          status,
            "model_dir":       str(AI_MODEL_DIR),
            "device":          str(_device) if _device else None,
            "anomaly_threshold_C": _anomaly_thr if ready else None,
            "features":        _model_cfg.get("features") if ready else None,
            "error":           _load_error,
        }

    @app.post(
        "/api/ai/predict-temperature",
        response_model=PredictResponse,
        tags=["AI"],
        summary="Predict ocean temperature with trained PyTorch model",
    )
    def api_predict_temperature(req: PredictRequest):
        """
        Runs the Ocean067 PyTorch model to predict temperature at
        the given location, depth, salinity, and date.
        """
        if _model is None:
            raise HTTPException(
                status_code=503,
                detail=f"AI model not available: {_load_error}",
            )
        try:
            temp = predict_temperature(
                req.latitude,
                req.longitude,
                req.pressure_dbar,
                req.salinity_psu,
                req.date,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            logger.exception("Prediction error")
            raise HTTPException(status_code=500, detail=str(exc))

        return PredictResponse(
            predicted_temperature_C=temp,
            latitude=req.latitude,
            longitude=req.longitude,
            pressure_dbar=req.pressure_dbar,
            salinity_psu=req.salinity_psu,
            date=req.date,
        )

    @app.post(
        "/api/ai/anomaly",
        response_model=AnomalyResponse,
        tags=["AI"],
        summary="Detect temperature anomaly against AI model prediction",
    )
    def api_anomaly(req: AnomalyRequest):
        """
        Compares an **observed** temperature against the model prediction.

        - `anomaly_C` = observed − predicted
        - Positive → warmer than expected; negative → colder.
        - `is_anomaly` is True when |anomaly| ≥ anomaly_threshold_C from model_config.json.
        - `anomaly_score` = |anomaly| / threshold (≥ 1.0 means anomalous).
        """
        if _model is None:
            raise HTTPException(
                status_code=503,
                detail=f"AI model not available: {_load_error}",
            )
        try:
            predicted = predict_temperature(
                req.latitude,
                req.longitude,
                req.pressure_dbar,
                req.salinity_psu,
                req.date,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            logger.exception("Prediction error during anomaly check")
            raise HTTPException(status_code=500, detail=str(exc))

        anomaly     = round(req.observed_temperature - predicted, 4)
        abs_anomaly = round(abs(anomaly), 4)
        score       = round(abs_anomaly / _anomaly_thr, 4) if _anomaly_thr > 0 else 0.0
        is_anomaly  = abs_anomaly >= _anomaly_thr

        if is_anomaly:
            direction = "warmer" if anomaly > 0 else "colder"
        else:
            direction = "normal"

        return AnomalyResponse(
            predicted_temperature_C  = predicted,
            observed_temperature_C   = round(req.observed_temperature, 4),
            anomaly_C                = anomaly,
            absolute_anomaly_C       = abs_anomaly,
            anomaly_score            = score,
            is_anomaly               = is_anomaly,
            direction                = direction,
            anomaly_threshold_C      = _anomaly_thr,
        )
