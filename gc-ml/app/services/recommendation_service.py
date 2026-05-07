"""
app/services/recommendation_service.py
---------------------------------------
Service-layer functions for generating and persisting gauge recommendations.
These are the only functions the API routes should call.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.db.repositories.gauge import (
    load_gauge_records_from_db,
    save_recommendation,
)
from app.db.mongo_client import gauge_lookup_filter, get_db
from app.ml.recommendation_engine import generate_recommendation



def _load_single_gauge(gauge_key: str) -> dict[str, Any] | None:
    """Fetch one gauge document by key (or gauge_id)."""
    normalized = str(gauge_key or "").strip()
    if not normalized:
        return None
    return get_db()["gauges"].find_one(gauge_lookup_filter(normalized), {"_id": 0})


def recommend_for_gauge(gauge_key: str) -> dict[str, Any]:
    """Generate and persist a recommendation for a single gauge.

    Returns the recommendation payload (or an error dict if the gauge is
    not found).
    """
    gauge = _load_single_gauge(gauge_key)
    if gauge is None:
        return {"error": f"Gauge '{gauge_key}' not found."}

    payload = generate_recommendation(gauge)
    # Store the full enriched prediction (risk + recommendation merged)
    recommendation = payload["latest_prediction"]
    recommendation["historical_analysis"] = payload.get("historical_analysis")
    recommendation["generated_at"] = datetime.utcnow().isoformat()

    save_recommendation(gauge_key, recommendation)
    return payload


def recommend_for_all_gauges() -> dict[str, Any]:
    """Generate and persist recommendations for every gauge in the database.

    Returns a summary with counts of updated, skipped, and error records.
    """
    gauges = load_gauge_records_from_db()
    updated = 0
    errors: list[str] = []

    for gauge in gauges:
        gauge_key = str(gauge.get("gauge_key") or "").strip()
        if not gauge_key:
            continue
        try:
            payload = generate_recommendation(gauge)
            recommendation = payload["latest_prediction"]
            recommendation["historical_analysis"] = payload.get("historical_analysis")
            recommendation["generated_at"] = datetime.utcnow().isoformat()
            if save_recommendation(gauge_key, recommendation):
                updated += 1
            else:
                errors.append(f"save_failed:{gauge_key}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{gauge_key}:{exc}")

    return {
        "updated": updated,
        "total": len(gauges),
        "errors": errors,
    }
