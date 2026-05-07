from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.date_utils import parse_date
from app.ml.scorer import score_gauge


def _days_between(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None
    return (end.date() - start.date()).days


def build_risk_payload(gauge: dict[str, Any], *, today: datetime | None = None) -> dict[str, Any]:
    if today is None:
        today = datetime.utcnow()

    result = score_gauge(gauge, today=today)
    features = result.features

    last_completion_date = parse_date(gauge.get("last_completion_date"))
    days_since_last_completion = _days_between(last_completion_date, today)

    frequency_gap_days = None
    if features.frequency_months > 0:
        frequency_gap_days = features.frequency_months * 30

    ml_features = {
        "days_until_due": features.days_until_due,
        "days_delayed": max(0, -features.days_until_due),
        "days_since_last_completion": days_since_last_completion,
        "frequency_gap_days": frequency_gap_days,
        "historical_failure_count": features.overdue_count,
        "decayed_overdue_score": features.decayed_overdue_score,
        "historical_success_rate": features.completion_rate,
        "avg_delay_days": features.avg_delay_days,
        "history_size": features.history_size,
        "computed_at": today,
    }

    latest_prediction = {
        "risk_score": result.risk_score,
        "risk_level": result.risk_level,
        "scored_with": result.scored_with,
        "margin_of_error": result.margin_of_error,
        "confidence_lower": result.confidence_lower,
        "confidence_upper": result.confidence_upper,
        "action": None,
        "reason": None,
        "signals": [],
        "issue_type": None,
        "recommended_frequency": None,
        "recommended_due_date": None,
        "scored_at": today,
    }

    return {"ml_features": ml_features, "latest_prediction": latest_prediction}
