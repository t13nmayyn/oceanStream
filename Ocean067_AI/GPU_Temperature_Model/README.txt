
OCEAN067 ARGO AI MODEL
======================

Dataset:
/content/drive/MyDrive/argo_measurements.csv

Task:
Predict expected ocean temperature from Argo measurements.

Framework:
PyTorch

GPU:
Tesla T4

Features:
latitude, longitude, pressure_dbar, log_depth, salinity_PSU, year, month, day_of_year, sin_doy, cos_doy, sin_lon, cos_lon, sin_lat, cos_lat

Target:
temperature_C

Architecture:
14 -> 256 -> 128 -> 64 -> 32 -> 1

Train:
70% profiles

Validation:
15% profiles

Test:
15% profiles

Split unit:
profile_id

Scaling:
StandardScaler fitted ONLY on training data.

Target scaling:
StandardScaler fitted ONLY on training data.

Loss:
Huber Loss

Optimizer:
AdamW

Batch size:
4096

Validation MAE:
0.548819 C

Validation RMSE:
0.896790 C

Validation R2:
0.986652

Test MAE:
0.589793 C

Test RMSE:
1.028869 C

Test R2:
0.982403

Anomaly:
Observed temperature - predicted temperature

Anomaly threshold:
95th percentile of validation absolute residuals

Threshold:
1.781711 C

Test anomalies:
38,150

Anomaly percentage:
5.89 %

IMPORTANT:
WMO, cycle and profile_id are NOT model input features.
They are identifiers/grouping information.
