"""
app/api/routes/recommendations.py
-----------------------------------
Recommendation endpoints.

POST /api/recommendations/gauge/{gauge_key}   — single gauge
POST /api/recommendations/run                 — all gauges (bulk)
GET  /api/recommendations/gauge/{gauge_key}   — fetch stored recommendation
"""

from fastapi import APIRouter, HTTPException

from app.services.recommendation_service import (
    recommend_for_all_gauges,
    recommend_for_gauge,
)
from app.db.mongo_client import gauge_lookup_filter, get_db

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.post("/gauge/{gauge_key}")
def generate_gauge_recommendation(gauge_key: str):
    """Generate (and persist) a fresh recommendation for one gauge."""
    result = recommend_for_gauge(gauge_key)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/run")
def generate_all_recommendations():
    """Generate and persist recommendations for every gauge in the database."""
    try:
        return recommend_for_all_gauges()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/gauge/{gauge_key}")
def get_gauge_recommendation(gauge_key: str):
    """Return the stored latest_recommendation for a gauge (no re-generation)."""
    doc = get_db()["gauges"].find_one(
        gauge_lookup_filter(gauge_key),
        {"_id": 0, "gauge_key": 1, "latest_recommendation": 1},
    )
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Gauge '{gauge_key}' not found.")
    rec = doc.get("latest_recommendation")
    if rec is None:
        raise HTTPException(
            status_code=404,
            detail=f"No recommendation found for gauge '{gauge_key}'. Run POST first.",
        )
    return {"gauge_key": doc.get("gauge_key"), "latest_recommendation": rec}
