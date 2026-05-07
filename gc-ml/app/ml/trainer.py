"""
app/ml/trainer.py
-----------------
Trains a Logistic Regression risk model on historical gauge data and derives
business-driven risk thresholds using precision–recall curves.

Training targets
~~~~~~~~~~~~~~~~
A gauge record is labelled **high-risk (y = 1)** when its average historical
calibration delay exceeds 30 days, i.e. it routinely misses deadlines badly.
Everything else is **safe (y = 0)**.

Thresholds
~~~~~~~~~~
  - HIGH_RISK_THRESHOLD  : lowest model probability (× 100) where precision ≥ 0.8
                           — 80 % of "High Risk" alerts correspond to real failures.
  - MEDIUM_RISK_THRESHOLD: lowest probability where recall  ≥ 0.8
                           — catches 80 % of all actual failures at Medium or above.

Outputs written to MODEL_DIR
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  risk_model.joblib        : trained sklearn pipeline
  feature_columns.joblib   : ordered feature-column names (for inference)
  training_metadata.joblib : run stats + threshold metadata
  thresholds.json          : dynamically computed risk thresholds (plain JSON)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from math import log1p
from typing import Any

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_curve
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.core.config import (
    FEATURES_PATH,
    HIGH_RISK_CUTOFF,
    MEDIUM_RISK_CUTOFF,
    METADATA_PATH,
    MODEL_DIR,
    MODEL_PATH,
)
from app.db.repositories.gauge import load_gauge_records_from_db
from app.ml.feature_engineering import extract_risk_features

log = logging.getLogger(__name__)

# Threshold for labelling a gauge as historically failing (y = 1).
# A gauge is considered 'at-risk' if ANY of these conditions apply:
#   (a) it is currently overdue
#   (b) it has at least one past overdue record
#   (c) its average delay across completed calibrations exceeds this value (days)
FAILURE_DELAY_THRESHOLD_DAYS: int = 7

# Target precision for the high-risk threshold.
HIGH_PRECISION_TARGET: float = 0.80

# Target recall for the medium-risk threshold.
MEDIUM_RECALL_TARGET: float = 0.80

# Path for the dynamic thresholds JSON file.
THRESHOLDS_PATH = os.path.join(MODEL_DIR, "thresholds.json")

# Ordered feature columns written to disk so scorer.py can reconstruct the
# same feature vector at inference time without importing trainer.py.
FEATURE_COLUMNS = [
    "days_until_due",
    "decayed_overdue_score",
    "completion_rate",
    "avg_delay_days",
    "frequency_months",
    "is_overdue",
    "frequency_term",
    "d_score",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_feature_row(gauge: dict[str, Any], today: datetime) -> list[float]:
    """Return a flat numeric feature vector for one gauge document."""
    features = extract_risk_features(gauge, today=today)

    overdue_days = max(0, -features.days_until_due)
    d_score = log1p(overdue_days)
    frequency_term = 1.0 / features.frequency_months if features.frequency_months > 0 else 0.0

    return [
        float(features.days_until_due),
        float(features.decayed_overdue_score),
        float(features.completion_rate),
        float(features.avg_delay_days),
        float(features.frequency_months),
        float(features.is_overdue),
        float(frequency_term),
        float(d_score),
    ]


def _build_label(gauge: dict[str, Any]) -> int:
    """Return 1 if this gauge shows any historical risk signal, else 0.

    A gauge is labelled high-risk (y = 1) when ANY of the following is true:
    - It is currently overdue (is_overdue == 1)
    - It has at least one past overdue schedule entry (overdue_count > 0)
    - Its average delay across completed calibrations exceeds FAILURE_DELAY_THRESHOLD_DAYS
    """
    features = extract_risk_features(gauge)
    return int(
        features.is_overdue == 1
        or features.overdue_count > 0
        or features.avg_delay_days > FAILURE_DELAY_THRESHOLD_DAYS
    )


def _derive_thresholds(
    model: Pipeline,
    X: np.ndarray,
    y: np.ndarray,
) -> tuple[float, float]:
    """Use precision–recall analysis to find business-driven cutoffs.

    Returns
    -------
    high_risk_threshold, medium_risk_threshold
        Both expressed as probability × 100 (i.e. on a 0-100 scale).

    Strategy
    --------
    * **High Risk** — the lowest probability threshold at which the model
      achieves *precision ≥ HIGH_PRECISION_TARGET* (default 80 %).
      Interpretation: at least 80 % of "High Risk" alerts are real failures.

    * **Medium Risk** — the *highest* probability threshold at which the
      model achieves *recall ≥ MEDIUM_RECALL_TARGET* (default 80 %).
      Interpretation: the alert captures at least 80 % of all actual failures
      at "Medium" or above, using the strictest possible boundary.
      A floor of max(5, high_thresh * 0.25) prevents it from collapsing to 0
      when the data is heavily imbalanced.
    """
    probabilities = model.predict_proba(X)[:, 1]  # probability of class 1

    precision_arr, recall_arr, thresholds = precision_recall_curve(y, probabilities)
    # sklearn appends a sentinel element — align arrays.
    precision_arr = precision_arr[:-1]
    recall_arr = recall_arr[:-1]

    # --- High Risk: lowest threshold where precision ≥ HIGH_PRECISION_TARGET ----
    high_mask = precision_arr >= HIGH_PRECISION_TARGET
    if high_mask.any():
        high_risk_prob = float(thresholds[high_mask][0])
    else:
        log.warning(
            "No threshold achieves precision >= %.2f. Using max-precision threshold.",
            HIGH_PRECISION_TARGET,
        )
        high_risk_prob = float(thresholds[np.argmax(precision_arr)])

    high_risk_prob = float(np.clip(high_risk_prob, 0.0, 1.0))

    # --- Medium Risk: highest threshold where recall ≥ MEDIUM_RECALL_TARGET ------
    medium_mask = recall_arr >= MEDIUM_RECALL_TARGET
    if medium_mask.any():
        # Highest threshold that still meets the recall target — strictest
        # boundary that still catches MEDIUM_RECALL_TARGET of all failures.
        medium_risk_prob = float(thresholds[medium_mask][-1])
    else:
        log.warning(
            "No threshold achieves recall >= %.2f. Using max-recall threshold.",
            MEDIUM_RECALL_TARGET,
        )
        medium_risk_prob = float(thresholds[np.argmax(recall_arr)])

    medium_risk_prob = float(np.clip(medium_risk_prob, 0.0, 1.0))

    # Clamping rules (all in raw probability, 0-1 scale):
    #  * medium_risk_prob must be < high_risk_prob.
    #  * medium_risk_prob must be at least 25 % of high_risk_prob (so it never
    #    collapses to 0 on heavily skewed data).
    #  * Leave a minimum gap of 1 % of high_risk between the two thresholds.
    gap = max(high_risk_prob * 0.01, 1e-6)
    medium_ceil = max(0.0, high_risk_prob - gap)
    medium_floor = high_risk_prob * 0.25
    medium_risk_prob = float(np.clip(medium_risk_prob, medium_floor, medium_ceil))

    # Convert to 0-100 scale (matches the scorer's output scale).
    return round(high_risk_prob * 100, 4), round(medium_risk_prob * 100, 4)



# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def train_risk_model() -> dict[str, Any]:
    """Train the Logistic Regression risk model and persist artefacts to disk.

    Returns a summary dict that is forwarded to the caller (e.g. the /api/train
    FastAPI endpoint).
    """
    today = datetime.utcnow()
    log.info("Starting risk model training at %s", today.isoformat())

    # 1. Load gauges ----------------------------------------------------------
    gauges = load_gauge_records_from_db()
    if not gauges:
        raise RuntimeError("No gauge records found in MongoDB — cannot train.")

    # 2. Build feature matrix + labels ----------------------------------------
    X_rows: list[list[float]] = []
    y_labels: list[int] = []
    skipped = 0

    for gauge in gauges:
        try:
            row = _build_feature_row(gauge, today)
            label = _build_label(gauge)
            X_rows.append(row)
            y_labels.append(label)
        except Exception as exc:  # noqa: BLE001
            gauge_key = gauge.get("gauge_key", "<unknown>")
            log.warning("Skipping gauge %s during feature extraction: %s", gauge_key, exc)
            skipped += 1

    if len(X_rows) < 2:
        raise RuntimeError(
            f"Insufficient training samples ({len(X_rows)} valid rows, {skipped} skipped). "
            "Need at least 2 records to train."
        )

    X = np.array(X_rows, dtype=float)
    y = np.array(y_labels, dtype=int)

    n_positive = int(y.sum())
    n_negative = len(y) - n_positive
    log.info(
        "Training on %d gauges (%d high-risk, %d safe). Skipped %d.",
        len(y), n_positive, n_negative, skipped,
    )

    # 3. Build + train pipeline -----------------------------------------------
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        (
            "lr",
            LogisticRegression(
                max_iter=1000,
                class_weight="balanced",   # handles class imbalance gracefully
                solver="lbfgs",
                random_state=42,
            ),
        ),
    ])
    pipeline.fit(X, y)

    # 4. Derive thresholds from precision–recall curve ------------------------
    if n_positive == 0 or n_negative == 0:
        log.warning(
            "Only one class present in training data. "
            "Using static fallback thresholds (%.2f / %.2f).",
            HIGH_RISK_CUTOFF, MEDIUM_RISK_CUTOFF,
        )
        high_thresh = HIGH_RISK_CUTOFF
        medium_thresh = MEDIUM_RISK_CUTOFF
        threshold_method = "static_fallback_single_class"
    else:
        high_thresh, medium_thresh = _derive_thresholds(pipeline, X, y)
        threshold_method = "precision_recall_curve"

    log.info(
        "Derived thresholds — High: %.4f, Medium: %.4f (method: %s)",
        high_thresh, medium_thresh, threshold_method,
    )

    # 5. Save artefacts -------------------------------------------------------
    os.makedirs(MODEL_DIR, exist_ok=True)

    joblib.dump(pipeline, MODEL_PATH)
    joblib.dump(FEATURE_COLUMNS, FEATURES_PATH)

    metadata = {
        "trained_at": today.isoformat(),
        "n_samples": len(y),
        "n_positive": n_positive,
        "n_negative": n_negative,
        "n_skipped": skipped,
        "feature_columns": FEATURE_COLUMNS,
        "high_risk_threshold": high_thresh,
        "medium_risk_threshold": medium_thresh,
        "threshold_method": threshold_method,
        "high_precision_target": HIGH_PRECISION_TARGET,
        "medium_recall_target": MEDIUM_RECALL_TARGET,
        "failure_delay_threshold_days": FAILURE_DELAY_THRESHOLD_DAYS,
    }
    joblib.dump(metadata, METADATA_PATH)

    thresholds_payload = {
        "high_risk_threshold": high_thresh,
        "medium_risk_threshold": medium_thresh,
        "trained_at": today.isoformat(),
        "threshold_method": threshold_method,
        "high_precision_target": HIGH_PRECISION_TARGET,
        "medium_recall_target": MEDIUM_RECALL_TARGET,
    }
    with open(THRESHOLDS_PATH, "w", encoding="utf-8") as fh:
        json.dump(thresholds_payload, fh, indent=2)

    log.info("Model artefacts written to %s", MODEL_DIR)

    return {
        "status": "ok",
        "n_samples": len(y),
        "n_positive": n_positive,
        "n_negative": n_negative,
        "n_skipped": skipped,
        "high_risk_threshold": high_thresh,
        "medium_risk_threshold": medium_thresh,
        "threshold_method": threshold_method,
        "model_path": MODEL_PATH,
        "thresholds_path": THRESHOLDS_PATH,
    }
