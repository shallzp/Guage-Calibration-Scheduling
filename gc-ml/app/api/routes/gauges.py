from fastapi import APIRouter, HTTPException

from app.db.mongo_client import gauge_lookup_filter, get_db
from app.db.repositories.gauge import (
    apply_frequency_recommendation,
    apply_reschedule_recommendation,
)

router = APIRouter(prefix="/api/gauge", tags=["gauge"])


@router.get("/{gauge_key}/risk")
def get_gauge_risk(gauge_key: str):
    """Return the latest risk classification for a single gauge."""
    doc = get_db()["gauges"].find_one(
        gauge_lookup_filter(gauge_key),
        {"_id": 0, "gauge_key": 1, "latest_prediction": 1, "ml_features": 1},
    )
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Gauge '{gauge_key}' not found.")
    return doc


@router.patch("/{gauge_key}/frequency")
def update_gauge_frequency(gauge_key: str, frequency_months: int):
    """Apply a frequency recommendation to a gauge."""
    ok = apply_frequency_recommendation(gauge_key, frequency_months)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"Gauge '{gauge_key}' not found or frequency unchanged.",
        )
    return {"gauge_key": gauge_key, "frequency_months": frequency_months, "applied": True}


@router.patch("/{gauge_key}/reschedule")
def reschedule_gauge(gauge_key: str, new_due_date: str, current_due_date: str | None = None):
    """Apply a due-date reschedule recommendation to a gauge."""
    ok = apply_reschedule_recommendation(
        gauge_key, new_due_date, current_due_date=current_due_date
    )
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"Gauge '{gauge_key}' not found or due date unchanged.",
        )
    return {"gauge_key": gauge_key, "new_due_date": new_due_date, "applied": True}