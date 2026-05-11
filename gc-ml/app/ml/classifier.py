from __future__ import annotations

from datetime import datetime
from typing import Any

from app.ml.scorer import score_gauge

def build_risk_payload(gauge: dict[str, Any], *, today: datetime | None = None) -> dict[str, Any]:
    if today is None:
        today = datetime.utcnow()

    result = score_gauge(gauge, today=today)
    features = result.features

    ml_features = {
        "days_until_due": features.days_until_due,
        "overdue_count": features.overdue_count,
        "completion_rate": features.completion_rate,
        "avg_delay_days": features.avg_delay_days,
        "frequency_months": features.frequency_months,
        "is_overdue": features.is_overdue,
        "next_due_date": features.next_due_date,
        "max_delay_days": features.max_delay_days,
        "history_size": features.history_size,
    }

    latest_prediction = {
        "risk_score": result.risk_score,
        "risk_level": result.risk_level,
        "action": None,
        "reason": None,
        "signals": [],
        "issue_type": None,
        "recommended_frequency": None,
        "recommended_due_date": None,
        "scored_at": today,
    }

    return {"ml_features": ml_features, "latest_prediction": latest_prediction}
