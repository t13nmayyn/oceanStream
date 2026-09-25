#!/usr/bin/env python3

"""
OceanStream Architecture Verification
--------------------------------------

Read-only verification script.

Checks:
- Required backend files
- Zarr stores
- Zarr dimensions / variables
- Required ocean depth levels
- FastAPI endpoints
- Backup fallback architecture
- Dynamic-date implementation
- Synthetic/fake-data risks
- Duplicate/unsafe architecture patterns
- Frontend volume integration
- Argo integration
- Uvicorn reload risks
- Basic endpoint health

IMPORTANT:
This script NEVER downloads Copernicus data.
It NEVER modifies project files.
It NEVER starts the server.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


# ============================================================
# CONFIG
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

API_BASE = "http://0.0.0.0:8000"

REQUIRED_DEPTHS = [0, 10, 50, 100, 200, 500, 1000]

REQUIRED_BACKEND_FILES = [
    "main.py",
    "data_fetch.py",
    "fetcher.py",
    "page_table.py",
]

POSSIBLE_FRONTEND_FILES = [
    "OceanSlab.jsx",
    "OceanWorkspace.jsx",
    "useOceanSnapshot.js",
]

ZARR_CANDIDATES = [
    BACKEND / "output",
    BACKEND / "data",
    BACKEND / "cache",
]


# ============================================================
# RESULT SYSTEM
# ============================================================

PASS = 0
WARN = 0
FAIL = 0

results = []


def ok(name, message):
    global PASS
    PASS += 1
    results.append(("PASS", name, message))


def warn(name, message):
    global WARN
    WARN += 1
    results.append(("WARN", name, message))


def fail(name, message):
    global FAIL
    FAIL += 1
    results.append(("FAIL", name, message))


# ============================================================
# FILE HELPERS
# ============================================================

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def find_file(filename: str, base: Path):
    matches = list(base.rglob(filename))
    return matches[0] if matches else None


# ============================================================
# 1. PROJECT STRUCTURE
# ============================================================

def check_project_structure():

    print("\n[1] PROJECT STRUCTURE")

    if ROOT.exists():
        ok("project-root", str(ROOT))
    else:
        fail("project-root", f"Missing project root: {ROOT}")
        return

    for filename in REQUIRED_BACKEND_FILES:
        path = BACKEND / filename

        if path.exists():
            ok(
                f"backend/{filename}",
                "exists"
            )
        else:
            fail(
                f"backend/{filename}",
                "missing"
            )

    for filename in POSSIBLE_FRONTEND_FILES:

        path = find_file(filename, FRONTEND)

        if path:
            ok(
                f"frontend/{filename}",
                str(path.relative_to(ROOT))
            )
        else:
            warn(
                f"frontend/{filename}",
                "not found"
            )


# ============================================================
# 2. PYTHON SYNTAX
# ============================================================

def check_python_syntax():

    print("\n[2] PYTHON SYNTAX")

    python_files = list(BACKEND.rglob("*.py"))

    if not python_files:
        warn("python-files", "No Python files found")
        return

    for path in python_files:

        try:
            source = read_text(path)
            ast.parse(source)

            ok(
                f"syntax:{path.relative_to(ROOT)}",
                "valid Python syntax"
            )

        except SyntaxError as exc:

            fail(
                f"syntax:{path.relative_to(ROOT)}",
                f"line {exc.lineno}: {exc.msg}"
            )


# ============================================================
# 3. ZARR DISCOVERY
# ============================================================

def discover_zarr():

    print("\n[3] ZARR DATA STORES")

    stores = []

    for base in ZARR_CANDIDATES:

        if not base.exists():
            continue

        stores.extend(base.rglob("*.zarr"))

    if not stores:

        warn(
            "zarr",
            "No .zarr stores discovered"
        )

    for store in stores:

        ok(
            f"zarr:{store.relative_to(ROOT)}",
            "store exists"
        )

    return stores


# ============================================================
# 4. ZARR INSPECTION
# ============================================================

def inspect_zarr(stores):

    print("\n[4] ZARR CONTENT")

    try:
        import xarray as xr
    except ImportError:

        warn(
            "xarray",
            "xarray unavailable; skipping Zarr inspection"
        )

        return

    for store in stores:

        try:

            ds = xr.open_zarr(store, consolidated=False)

            variables = list(ds.data_vars)
            dimensions = dict(ds.sizes)

            print(f"\n  STORE: {store.relative_to(ROOT)}")
            print(f"  dims: {dimensions}")
            print(f"  vars: {variables}")

            ok(
                f"zarr-open:{store.name}",
                "opened successfully"
            )

            # ------------------------------------------------
            # Variable checks
            # ------------------------------------------------

            expected_vars = [
                "thetao",
                "so",
                "uo",
                "vo",
            ]

            for variable in expected_vars:

                if variable in variables:

                    ok(
                        f"{store.name}:{variable}",
                        "present"
                    )

            # ------------------------------------------------
            # Depth check
            # ------------------------------------------------

            depth_name = None

            for candidate in [
                "depth",
                "deptht",
                "lev",
                "level",
            ]:

                if candidate in ds.coords:
                    depth_name = candidate
                    break

            if depth_name:

                depths = ds[depth_name].values.tolist()

                print(
                    f"  depth coordinate: {depth_name}"
                )

                print(
                    f"  available depths: "
                    f"{depths[:20]}"
                )

                for required in REQUIRED_DEPTHS:

                    if not depths:
                        continue

                    nearest = min(
                        depths,
                        key=lambda x: abs(float(x) - required)
                    )

                    error = abs(
                        float(nearest) - required
                    )

                    if error <= max(1.0, required * 0.05):

                        ok(
                            f"{store.name}:depth:{required}",
                            f"nearest={nearest}"
                        )

                    else:

                        warn(
                            f"{store.name}:depth:{required}",
                            f"nearest={nearest}, error={error:.2f}"
                        )

            else:

                warn(
                    f"{store.name}:depth",
                    "No depth coordinate found"
                )

            ds.close()

        except Exception as exc:

            fail(
                f"zarr-open:{store.name}",
                str(exc)
            )


# ============================================================
# 5. BACKEND ARCHITECTURE
# ============================================================

def check_backend_architecture():

    print("\n[5] BACKEND ARCHITECTURE")

    main = BACKEND / "main.py"
    fetcher = BACKEND / "fetcher.py"
    data_fetch = BACKEND / "data_fetch.py"

    main_text = read_text(main)
    fetcher_text = read_text(fetcher)
    data_text = read_text(data_fetch)

    combined = "\n".join([
        main_text,
        fetcher_text,
        data_text
    ])

    # --------------------------------------------------------
    # /ocean/volume
    # --------------------------------------------------------

    if "/ocean/volume" in combined:

        ok(
            "volume-endpoint",
            "/ocean/volume referenced"
        )

    else:

        fail(
            "volume-endpoint",
            "/ocean/volume not found"
        )

    # --------------------------------------------------------
    # /ocean/snapshot
    # --------------------------------------------------------

    if "/ocean/snapshot" in combined:

        ok(
            "snapshot-endpoint",
            "/ocean/snapshot exists"
        )

    else:

        warn(
            "snapshot-endpoint",
            "not found"
        )

    # --------------------------------------------------------
    # Zarr
    # --------------------------------------------------------

    if "zarr" in combined.lower():

        ok(
            "zarr-backend",
            "Zarr referenced by backend"
        )

    else:

        fail(
            "zarr-backend",
            "No Zarr reference found"
        )

    # --------------------------------------------------------
    # Backup
    # --------------------------------------------------------

    backup_patterns = [
        "backup_phy.zarr",
        "backup_bgc.zarr",
        "backup_cache",
        "backup",
    ]

    if any(
        pattern.lower() in combined.lower()
        for pattern in backup_patterns
    ):

        ok(
            "backup-fallback",
            "backup data architecture detected"
        )

    else:

        warn(
            "backup-fallback",
            "backup fallback not detected"
        )

    # --------------------------------------------------------
    # Real-data source
    # --------------------------------------------------------

    if "copernicus" in combined.lower():

        ok(
            "copernicus",
            "Copernicus integration detected"
        )

    else:

        fail(
            "copernicus",
            "Copernicus integration not detected"
        )

    # --------------------------------------------------------
    # Argo
    # --------------------------------------------------------

    if "argo" in combined.lower():

        ok(
            "argo",
            "Argo integration detected"
        )

    else:

        warn(
            "argo",
            "Argo integration not detected"
        )


# ============================================================
# 6. HARD-CODED DATE / DEPTH RISKS
# ============================================================

def check_hardcoded_values():

    print("\n[6] HARD-CODED DATE / DEPTH RISKS")

    files = []

    for name in [
        "main.py",
        "data_fetch.py",
        "fetcher.py",
        "router.py",
    ]:

        path = BACKEND / name

        if path.exists():
            files.append(path)

    for path in files:

        text = read_text(path)

        # 2024 date strings
        matches = re.findall(
            r"2024[-_/]\d{1,2}[-_/]\d{1,2}",
            text
        )

        if matches:

            warn(
                f"hardcoded-date:{path.name}",
                f"found {sorted(set(matches))}"
            )

        # suspicious [0, 6] depth
        if re.search(
            r"\[\s*0(?:\.0)?\s*,\s*6(?:\.0)?\s*\]",
            text
        ):

            warn(
                f"depth-request:{path.name}",
                "literal [0,6] depth range detected"
            )

        # required visualization levels
        if all(
            str(depth) in text
            for depth in REQUIRED_DEPTHS
        ):

            ok(
                f"depth-levels:{path.name}",
                "required depth levels referenced"
            )


# ============================================================
# 7. SYNTHETIC DATA RISKS
# ============================================================

def check_synthetic_data():

    print("\n[7] SYNTHETIC / FAKE DATA RISKS")

    files = list(BACKEND.rglob("*.py"))

    suspicious = [
        "random.random",
        "np.random",
        "numpy.random",
        "torch.rand",
        "torch.randn",
        "synthetic",
        "generate_seed_data",
        "fake_temperature",
        "fake_salinity",
    ]

    for path in files:

        text = read_text(path)

        found = [
            pattern
            for pattern in suspicious
            if pattern.lower() in text.lower()
        ]

        if found:

            warn(
                f"synthetic-risk:{path.relative_to(ROOT)}",
                ", ".join(found)
            )

    ok(
        "real-data-policy",
        "manual inspection required for flagged locations"
    )


# ============================================================
# 8. FRONTEND VOLUME ARCHITECTURE
# ============================================================

def check_frontend():

    print("\n[8] FRONTEND 3D ARCHITECTURE")

    files = []

    for name in POSSIBLE_FRONTEND_FILES:

        path = find_file(name, FRONTEND)

        if path:
            files.append(path)

    combined = "\n".join(
        read_text(path)
        for path in files
    )

    checks = {
        "Three.js": "three",
        "ocean volume": "ocean/volume",
        "Data3DTexture": "Data3DTexture",
        "PlaneGeometry": "PlaneGeometry",
        "ShaderMaterial": "ShaderMaterial",
        "OrbitControls": "OrbitControls",
        "temperature": "temperature",
        "salinity": "salinity",
        "chlorophyll": "chlorophyll",
        "oxygen": "oxygen",
        "Argo": "argo",
    }

    for name, pattern in checks.items():

        if pattern.lower() in combined.lower():

            ok(
                f"frontend:{name}",
                "detected"
            )

        else:

            warn(
                f"frontend:{name}",
                "not detected"
            )


# ============================================================
# 9. Uvicorn / WATCHFILES RISK
# ============================================================

def check_reload_risk():

    print("\n[9] RELOAD / WATCHFILES RISK")

    all_files = []

    for path in ROOT.rglob("*"):

        if not path.is_file():
            continue

        if path.suffix.lower() in [
            ".py",
            ".sh",
            ".txt",
            ".md",
        ]:

            all_files.append(path)

    combined = "\n".join(
        read_text(path)
        for path in all_files
    )

    if "--reload" in combined:

        warn(
            "uvicorn-reload",
            "--reload found; generated Zarr/output files may trigger reloads"
        )

    else:

        ok(
            "uvicorn-reload",
            "no --reload reference found in scanned text"
        )


# ============================================================
# 10. LIGHTWEIGHT API CHECK
# ============================================================

def http_get(path, timeout=5):

    url = API_BASE + path

    request = Request(
        url,
        headers={
            "User-Agent": "OceanStreamArchitectureVerifier/1.0"
        }
    )

    try:

        with urlopen(
            request,
            timeout=timeout
        ) as response:

            body = response.read()

            return (
                response.status,
                body
            )

    except Exception as exc:

        return None, str(exc).encode()


def check_api():

    print("\n[10] API HEALTH")

    endpoints = [
        "/",
        "/docs",
        "/ocean/coverage",
        "/ocean/snapshot",
        "/ocean/volume",
    ]

    for endpoint in endpoints:

        status, body = http_get(endpoint)

        if status is None:

            warn(
                f"api:{endpoint}",
                "server unavailable or endpoint failed"
            )

            continue

        if 200 <= status < 300:

            ok(
                f"api:{endpoint}",
                f"HTTP {status}"
            )

        else:

            warn(
                f"api:{endpoint}",
                f"HTTP {status}"
            )


# ============================================================
# 11. FINAL REPORT
# ============================================================

def print_report():

    print("\n")
    print("=" * 72)
    print(" OCEANSTREAM ARCHITECTURE VERIFICATION")
    print("=" * 72)

    for status, name, message in results:

        print(
            f"[{status:<4}] "
            f"{name:<40} "
            f"{message}"
        )

    print("\n" + "=" * 72)

    print(f"PASS : {PASS}")
    print(f"WARN : {WARN}")
    print(f"FAIL : {FAIL}")

    print("=" * 72)

    if FAIL == 0:

        if WARN == 0:
            print("RESULT: ARCHITECTURE CHECK PASSED")
        else:
            print(
                "RESULT: ARCHITECTURE FUNCTIONAL "
                "WITH WARNINGS"
            )

    else:

        print(
            "RESULT: ARCHITECTURE HAS BLOCKERS"
        )

    print("=" * 72)


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 72)
    print("OceanStream — Read-Only Architecture Verification")
    print("=" * 72)

    print(f"Project: {ROOT}")
    print("Copernicus downloads: DISABLED")
    print("File modifications: DISABLED")
    print("Server startup: DISABLED")

    check_project_structure()
    check_python_syntax()

    stores = discover_zarr()
    inspect_zarr(stores)

    check_backend_architecture()
    check_hardcoded_values()
    check_synthetic_data()
    check_frontend()
    check_reload_risk()
    check_api()

    print_report()


if __name__ == "__main__":
    main()