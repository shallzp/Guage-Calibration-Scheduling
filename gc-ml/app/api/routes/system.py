from fastapi import APIRouter, HTTPException

from app.services.risk_services import update_all_gauge_predictions

router = APIRouter(prefix="/api", tags=["system"])


@router.post("/risk/run")
def run_risk_scoring(update_batches: bool = True):
    try:
        return update_all_gauge_predictions(update_batches=update_batches)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
