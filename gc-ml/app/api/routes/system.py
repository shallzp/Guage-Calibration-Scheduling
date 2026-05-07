from fastapi import APIRouter, HTTPException

from app.services.risk_services import update_all_gauge_predictions
from app.ml.trainer import train_risk_model
from app.ml.scorer import reload_model_cache

router = APIRouter(prefix="/api", tags=["system"])


@router.post("/risk/run")
def run_risk_scoring(update_batches: bool = True):
    try:
        return update_all_gauge_predictions(update_batches=update_batches)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/train")
def run_training():
    """Train the Logistic Regression risk model on current gauge history.

    This endpoint:
    1. Loads all gauge documents from MongoDB.
    2. Extracts features (including temporal decay).
    3. Trains a Logistic Regression model and saves it to disk.
    4. Derives optimal risk thresholds using a precision-recall curve.
    5. Saves thresholds to thresholds.json.
    6. Clears the scorer's in-memory model cache so subsequent /risk/run
       calls immediately use the new model and thresholds.

    Call this after a significant accumulation of new historical data to
    ensure the model weights and thresholds reflect current failure patterns.
    """
    try:
        result = train_risk_model()
        # Flush lazy caches so the updated model is used straight away.
        reload_model_cache()
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
