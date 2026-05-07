from __future__ import annotations

from dataclasses import dataclass
from math import log1p

from app.ml.feature_engineering import GaugeRiskFeatures, extract_risk_features

# import from app.core.config
from app.core.config import HIGH_RISK_CUTOFF, MEDIUM_RISK_CUTOFF


@dataclass(frozen=True)
class RiskScoreResult:
    risk_score: float
    risk_level: str
    features: GaugeRiskFeatures


def compute_risk_score(features: GaugeRiskFeatures) -> float:
    overdue_days = max(0, -features.days_until_due)
    d_score = log1p(overdue_days)

    completion_penalty = 1.0 - max(0.0, min(1.0, features.completion_rate))

    frequency_term = 0.0
    if features.frequency_months > 0:
        frequency_term = 1.0 / features.frequency_months

    score = (
        3.0 * d_score
        + 3.0 * features.overdue_count
        + 8.0 * completion_penalty
        + 1.5 * frequency_term
        + 4.0 * features.is_overdue
    )

    return float(score)


def risk_level_from_score(score: float) -> str:
    if score >= HIGH_RISK_CUTOFF:
        return "high"
    if score >= MEDIUM_RISK_CUTOFF:
        return "medium"
    return "low"


def score_gauge(gauge: dict, *, today=None) -> RiskScoreResult:
    features = extract_risk_features(gauge, today=today)
    score = compute_risk_score(features)
    level = risk_level_from_score(score)
    return RiskScoreResult(risk_score=score, risk_level=level, features=features)
