"""
Central configuration constants for the ML risk pipeline.
All paths, thresholds, and tuning knobs live here.
"""

import os

# ---------------------------------------------------------------------------
# Model artifact paths (relative to project root)
# ---------------------------------------------------------------------------
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_DIR = os.path.join(_PROJECT_ROOT, "model")

MODEL_PATH = os.path.join(MODEL_DIR, "risk_model.joblib")
FEATURES_PATH = os.path.join(MODEL_DIR, "feature_columns.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "training_metadata.joblib")

# ---------------------------------------------------------------------------
# Risk classification thresholds
# ---------------------------------------------------------------------------
HIGH_RISK_CUTOFF = 20.22
MEDIUM_RISK_CUTOFF = 6.13

# ---------------------------------------------------------------------------
# Standard calibration frequency ladder (months)
# ---------------------------------------------------------------------------
FREQUENCY_SEQUENCE = [1, 4, 6, 12, 24]

# ---------------------------------------------------------------------------
# Reschedule candidate offsets (days from current due date)
# ---------------------------------------------------------------------------
RESCHEDULE_OFFSETS = [1, 2, 3]

# ---------------------------------------------------------------------------
# Feature engineering constants
# ---------------------------------------------------------------------------
DAYS_PER_MONTH = 30.44             # average days per calendar month
