"""
app/ml/scorer.py
----------------
Computes a risk score for a single gauge.

Scoring strategy
~~~~~~~~~~~~~~~~
1. **Model-based** (preferred): if a trained ``risk_model.joblib`` exists, the
   Logistic Regression pipeline predicts P(high-risk) and the score is that
   probability × 100 (range 0–100).

2. **Heuristic fallback**: if no model file is found the legacy weighted formula
   is used so the service keeps working before the first training run.

Confidence intervals (Issue #6)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
We report a 95 % confidence interval around the probability score using the
standard Wald formula for proportions::

    moe = 1.96 * sqrt(p * (1 - p) / max(1, N)) * 100

where ``N`` is the gauge's ``history_size`` (# completed + overdue records).
A gauge with 2 historical records will have a wide CI; one with 50 will be tight.

Risk thresholds
~~~~~~~~~~~~~~~
Loaded from ``thresholds.json`` if available (written by trainer.py); otherwise
fall back to ``HIGH_RISK_CUTOFF`` / ``MEDIUM_RISK_CUTOFF`` from config.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from math import log1p, sqrt
from typing import Any

import joblib
import numpy as np

from app.ml.feature_engineering import GaugeRiskFeatures, extract_risk_features

from app.core.config import (
    HIGH_RISK_CUTOFF,
    MEDIUM_RISK_CUTOFF,
    MODEL_DIR,
    MODEL_PATH,
)

log = logging.getLogger(__name__)

# Z-score for a 95 % confidence interval.
_Z95 = 1.96

THRESHOLDS_PATH = os.path.join(MODEL_DIR, "thresholds.json")

# ---------------------------------------------------------------------------
# Module-level lazy caches — loaded once per process.
# ---------------------------------------------------------------------------
_model: Any = None          # sklearn Pipeline or None
_thresholds: dict | None = None   # {high_risk_threshold, medium_risk_threshold}


def _load_model() -> Any | None:
    """Return the trained sklearn Pipeline, or None if not yet trained."""
    global _model
    if _model is not None:
        return _model
    if os.path.exists(MODEL_PATH):
        try:
            _model = joblib.load(MODEL_PATH)
            log.info("Risk model loaded from %s", MODEL_PATH)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to load risk model: %s. Using heuristic fallback.", exc)
            _model = None
    return _model


def _load_thresholds() -> tuple[float, float]:
    """Return (high_risk_threshold, medium_risk_threshold) on a 0-100 scale."""
    global _thresholds
    if _thresholds is not None:
        return _thresholds["high_risk_threshold"], _thresholds["medium_risk_threshold"]
    if os.path.exists(THRESHOLDS_PATH):
        try:
            with open(THRESHOLDS_PATH, encoding="utf-8") as fh:
                _thresholds = json.load(fh)
            return _thresholds["high_risk_threshold"], _thresholds["medium_risk_threshold"]
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to load thresholds.json: %s. Using static config.", exc)
    return HIGH_RISK_CUTOFF, MEDIUM_RISK_CUTOFF


def reload_model_cache() -> None:
    """Force the module to reload the model and thresholds on next call.

    Call this after a new training run so the scoring process picks up the
    updated artefacts without a full service restart.
    """
    global _model, _thresholds
    _model = None
    _thresholds = None


# ---------------------------------------------------------------------------
# Public data structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RiskScoreResult:
    risk_score: float
    risk_level: str
    features: GaugeRiskFeatures
    # Confidence interval (CI) fields — all on the same 0-100 scale as risk_score.
    margin_of_error: float      # 1.96 × SE × 100
    confidence_lower: float     # risk_score − margin_of_error  (≥ 0)
    confidence_upper: float     # risk_score + margin_of_error  (≤ 100)
    scored_with: str            # "model" | "heuristic"


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _heuristic_score(features: GaugeRiskFeatures) -> float:
    """Legacy weighted formula — used when no trained model is available."""
    overdue_days = max(0, -features.days_until_due)
    d_score = log1p(overdue_days)

    completion_penalty = 1.0 - max(0.0, min(1.0, features.completion_rate))

    frequency_term = 0.0
    if features.frequency_months > 0:
        frequency_term = 1.0 / features.frequency_months

    return float(
        3.0 * d_score
        + 3.0 * features.decayed_overdue_score    # uses decayed score (Issue #3)
        + 8.0 * completion_penalty
        + 1.5 * frequency_term
        + 4.0 * features.is_overdue
    )


def _model_feature_vector(features: GaugeRiskFeatures) -> np.ndarray:
    """Build the 1×8 feature matrix the trained pipeline expects."""
    from math import log1p  # local to avoid shadowing module-level import
    overdue_days = max(0, -features.days_until_due)
    d_score = log1p(overdue_days)
    frequency_term = 1.0 / features.frequency_months if features.frequency_months > 0 else 0.0

    return np.array([[
        float(features.days_until_due),
        float(features.decayed_overdue_score),
        float(features.completion_rate),
        float(features.avg_delay_days),
        float(features.frequency_months),
        float(features.is_overdue),
        float(frequency_term),
        float(d_score),
    ]])


def _confidence_interval(score_0_100: float, history_size: int) -> tuple[float, float, float]:
    """Return (margin_of_error, lower_bound, upper_bound) on 0-100 scale.

    Uses the Wald 95 % CI for a proportion:
        moe = Z * sqrt(p * (1-p) / N) * 100
    where p = score / 100 and N = history_size.
    """
    p = score_0_100 / 100.0
    n = max(1, history_size)   # guard against division by zero
    moe = _Z95 * sqrt(p * (1.0 - p) / n) * 100.0
    lower = max(0.0, score_0_100 - moe)
    upper = min(100.0, score_0_100 + moe)
    return round(moe, 4), round(lower, 4), round(upper, 4)


# ---------------------------------------------------------------------------
# Core public functions
# ---------------------------------------------------------------------------

def compute_risk_score(features: GaugeRiskFeatures) -> tuple[float, str]:
    """Return (score, scored_with) for the given feature object.

    score       — 0-100 probability-based (model) or raw heuristic (fallback)
    scored_with — "model" | "heuristic"
    """
    model = _load_model()
    if model is not None:
        try:
            X = _model_feature_vector(features)
            prob = float(model.predict_proba(X)[0][1])
            return round(prob * 100, 4), "model"
        except Exception as exc:  # noqa: BLE001
            log.warning("Model inference failed: %s. Falling back to heuristic.", exc)

    return round(_heuristic_score(features), 4), "heuristic"


def risk_level_from_score(score: float) -> str:
    high_thresh, medium_thresh = _load_thresholds()
    if score >= high_thresh:
        return "high"
    if score >= medium_thresh:
        return "medium"
    return "low"


def score_gauge(gauge: dict, *, today=None) -> RiskScoreResult:
    from datetime import datetime
    if today is None:
        today = datetime.utcnow()

    features = extract_risk_features(gauge, today=today)
    score, scored_with = compute_risk_score(features)
    level = risk_level_from_score(score)

    moe, ci_lower, ci_upper = _confidence_interval(score, features.history_size)

    return RiskScoreResult(
        risk_score=score,
        risk_level=level,
        features=features,
        margin_of_error=moe,
        confidence_lower=ci_lower,
        confidence_upper=ci_upper,
        scored_with=scored_with,
    )
