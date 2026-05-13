from __future__ import annotations

import os
import joblib
import pandas as pd
from dataclasses import dataclass

from app.ml.feature_engineering import GaugeRiskFeatures, extract_risk_features
from app.core.config import (
    HIGH_RISK_CUTOFF,
    MEDIUM_RISK_CUTOFF,
    MODEL_PATH,
    FEATURES_PATH,
    METADATA_PATH,
    RISK_SCALER_PATH,
)

# Global Model State (Lazy Loading)
_model = None
_scaler = None
_feature_cols = None
_high_cutoff = HIGH_RISK_CUTOFF
_medium_cutoff = MEDIUM_RISK_CUTOFF

def _load_model() -> None:
    global _model, _scaler, _feature_cols, _high_cutoff, _medium_cutoff

    if _model is not None:
        return  # already loaded

    if not os.path.exists(MODEL_PATH) or not os.path.exists(FEATURES_PATH):
        raise FileNotFoundError(
            f"Model or features not found at {MODEL_PATH}. Run trainer.py first."
        )

    _model = joblib.load(MODEL_PATH)
    _feature_cols = joblib.load(FEATURES_PATH)

    # Load scaler (required — model was trained on scaled data)
    if os.path.exists(RISK_SCALER_PATH):
        _scaler = joblib.load(RISK_SCALER_PATH)
    else:
        raise FileNotFoundError(
            f"Scaler not found at {RISK_SCALER_PATH}. Re-run trainer.py to regenerate."
        )

    # Load auto-calibrated thresholds
    if os.path.exists(METADATA_PATH):
        meta = joblib.load(METADATA_PATH)
        _high_cutoff = meta.get("HIGH_RISK_CUTOFF", HIGH_RISK_CUTOFF)
        _medium_cutoff = meta.get("MEDIUM_RISK_CUTOFF", MEDIUM_RISK_CUTOFF)


def reload_model() -> None:
    """
    Force-reload the risk model from disk, discarding the in-memory cache.
    Call this after training completes so scoring immediately uses the new model.
    """
    global _model, _scaler, _feature_cols, _high_cutoff, _medium_cutoff
    _model = None
    _scaler = None
    _feature_cols = None
    _high_cutoff = HIGH_RISK_CUTOFF
    _medium_cutoff = MEDIUM_RISK_CUTOFF
    _load_model()  # re-load from disk immediately


# Result dataclass

@dataclass(frozen=True)
class RiskScoreResult:
    risk_score: float
    risk_level: str
    features: GaugeRiskFeatures


# Core scoring functions

def compute_risk_score(features: GaugeRiskFeatures) -> float:
    """
    Returns a 0–100 risk score derived from P(HIGH) output of the
    Logistic Regression model.
    """
    try:
        _load_model()
    except FileNotFoundError:
        return 0.0

    if _model is None or _feature_cols is None or _scaler is None:
        return 0.0

    x_dict = {
        "days_until_due":    features.days_until_due,
        "overdue_count":     features.overdue_count,
        "completion_rate":   features.completion_rate,
        "avg_delay_days":    features.avg_delay_days,
        "frequency_months":  features.frequency_months,
        "is_overdue":        features.is_overdue,
        "max_delay_days":    features.max_delay_days,
        "history_size":      features.history_size,
    }

    X_df = pd.DataFrame([x_dict])

    # Ensure column alignment with training
    for col in _feature_cols:
        if col not in X_df.columns:
            X_df[col] = 0.0
    X_df = X_df[_feature_cols]

    # Apply the same scaler used during training
    X_scaled = _scaler.transform(X_df)

    # P(HIGH) — class label 2
    proba = _model.predict_proba(X_scaled)[0]
    classes = list(_model.classes_)

    if 2 in classes:
        high_idx = classes.index(2)
        risk_prob = proba[high_idx]
    else:
        risk_prob = 0.0

    return float(risk_prob * 100.0)


def risk_level_from_score(score: float) -> str:
    if score >= _high_cutoff:
        return "high"
    if score >= _medium_cutoff:
        return "medium"
    return "low"


def score_gauge(gauge: dict, *, today=None) -> RiskScoreResult:
    features = extract_risk_features(gauge, today=today)
    score = compute_risk_score(features)
    level = risk_level_from_score(score)
    return RiskScoreResult(risk_score=score, risk_level=level, features=features)
