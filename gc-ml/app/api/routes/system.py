from fastapi import APIRouter, HTTPException

from app.services.risk_services import update_all_gauge_predictions, update_single_gauge_prediction

router = APIRouter(prefix="/api", tags=["system"])


@router.post("/risk/run")
def run_risk_scoring(update_batches: bool = True):
    try:
        return update_all_gauge_predictions(update_batches=update_batches)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router.post("/risk/gauge/{gauge_key}/run")
def run_single_risk_scoring(gauge_key: str, update_batches: bool = True):
    try:
        return update_single_gauge_prediction(gauge_key, update_batches=update_batches)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
