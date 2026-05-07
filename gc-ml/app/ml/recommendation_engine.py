"""
app/ml/recommendation_engine.py
---------------------------------
Orchestrator — the single public entry point for generating recommendations.

Import dependency chain (no cycles):
    feature_engineering  →  scorer  →  classifier  (risk scoring)
    date_utils           →  historical_analyzer     (history mining)
                                ↓
                           recommender              (scoring logic)
                                ↓
                      recommendation_engine         ← you are here

External callers (service layer, tests) should import only:
    from app.ml.recommendation_engine import generate_recommendation
                                          (or build_risk_and_recommendation_payload)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.date_utils import parse_date
from app.ml.classifier import build_risk_payload
from app.ml.historical_analyzer import analyze_gauge_history
from app.ml.recommender import ActionType, GaugeRecommender


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def generate_recommendation(
    gauge: dict[str, Any],
    *,
    today: datetime | None = None,
) -> dict[str, Any]:
    """Full recommendation pipeline for one gauge document.

    Steps
    -----
    1. Score the gauge (risk payload via ``build_risk_payload``).
    2. Mine historical patterns (``analyze_gauge_history``).
    3. Run ``GaugeRecommender`` to pick the best action + params.
    4. Merge the recommendation back into the risk payload so the output
       matches the expected ``latest_prediction`` schema.

    Returns
    -------
    dict with keys:
        ``ml_features``        — same as build_risk_payload
        ``latest_prediction``  — risk fields + recommendation fields merged
        ``historical_analysis``— summary of the history used for the decision
    """
    if today is None:
        today = datetime.utcnow()

    # Step 1 — risk scoring
    risk_payload = build_risk_payload(gauge, today=today)
    ml_features: dict[str, Any] = risk_payload["ml_features"]
    latest_prediction: dict[str, Any] = risk_payload["latest_prediction"]

    # Step 2 — historical analysis
    historical = analyze_gauge_history(gauge, today=today)

    # Step 3 — resolve next pending due date for reschedule param builder
    schedule_table = list(gauge.get("schedule_table") or [])
    next_due_date: str | None = None
    for entry in schedule_table:
        if str(entry.get("status") or "").strip().lower() in {"not-started", "in-progress"}:
            nd = parse_date(entry.get("due_date"))
            if nd:
                next_due_date = nd.date().isoformat()
            break

    recommender = GaugeRecommender(
        historical=historical,
        current_risk_score=latest_prediction["risk_score"],
        current_frequency_months=int(gauge.get("frequency") or 6),
        days_until_due=int(ml_features.get("days_until_due") or 0),
        frequency_gap_days=int(ml_features.get("frequency_gap_days") or 180),
        next_due_date=next_due_date,
    )

    result = recommender.generate_recommendation(today=today)

    # Step 4 — merge recommendation fields into latest_prediction
    latest_prediction.update(
        {
            "action": result.action.value,
            "reason": result.reasoning,
            "signals": _build_signals(result),
            "issue_type": _issue_type(result),
            "recommended_frequency": (
                result.parameters.get("recommended_frequency_months")
                if result.action == ActionType.FREQUENCY_INCREASE
                else None
            ),
            "recommended_due_date": (
                result.parameters.get("recommended_due_date")
                if result.action == ActionType.RESCHEDULE
                else None
            ),
            "recommendation_confidence": result.confidence,
            "action_scores": result.action_scores,
        }
    )

    return {
        "ml_features": ml_features,
        "latest_prediction": latest_prediction,
        "historical_analysis": {
            "total_completions": historical.total_completions,
            "overdue_rate": round(historical.overdue_rate, 4),
            "avg_delay_days": round(historical.avg_delay_days, 2),
            "median_delay_days": round(historical.median_delay_days, 1),
            "delay_trend": historical.delay_trend,
            "consistent_delay": historical.consistent_delay,
            "recent_avg_delay": round(historical.recent_avg_delay, 1),
            "analyzed_at": today.isoformat(),
        },
    }


# Alias — matches the name used in the updated classifier.py docstring
build_risk_and_recommendation_payload = generate_recommendation


# ---------------------------------------------------------------------------
# Private signal / issue-type helpers
# ---------------------------------------------------------------------------

def _build_signals(result) -> list[str]:
    """Derive the signals list from the recommendation result."""
    signals: list[str] = []
    h = result.supporting_data.get("historical", {})
    c = result.supporting_data.get("current", {})

    if h.get("overdue_rate", 0) > 0.5:
        signals.append("high_historical_overdue_rate")

    if h.get("consistent_delay"):
        signals.append("consistent_delay_pattern")

    if h.get("delay_trend") == "increasing":
        signals.append("increasing_delay_trend")

    if c.get("is_overdue"):
        signals.append("currently_overdue")

    if result.confidence > 0.8:
        signals.append("high_confidence_recommendation")

    return signals


def _issue_type(result) -> str | None:
    if result.action == ActionType.FREQUENCY_INCREASE:
        return "chronic_delay"
    if result.action == ActionType.RESCHEDULE:
        return "minor_scheduling_misalignment"
    return None
