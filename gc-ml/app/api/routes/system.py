import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.services.risk_services import update_all_gauge_predictions, update_single_gauge_prediction
from app.ml.trainer import train_model
from app.ml.scorer import reload_model

router = APIRouter(prefix="/api", tags=["system"])


# ---------------------------------------------------------------------------
# Training job state  (in-process; resets on server restart)
# ---------------------------------------------------------------------------

_training_lock = threading.Lock()

_training_state: dict = {
    "status": "idle",          # idle | running | done | error
    "started_at": None,
    "finished_at": None,
    "error": None,
}


def _run_training() -> None:
    """Background thread target — runs all three training pipelines."""
    global _training_state
    _training_state.update({
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "error": None,
    })
    try:
        train_model()
        reload_model()  # Flush the in-memory model cache so scoring uses new weights
        _training_state.update({
            "status": "done",
            "finished_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        _training_state.update({
            "status": "error",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error": str(exc),
        })


# ---------------------------------------------------------------------------
# Training endpoints
# ---------------------------------------------------------------------------

@router.post("/train", status_code=202)
def trigger_training():
    """
    Kick off a full model retrain (risk + overrun + recommendation) in the
    background.  Returns 202 immediately — poll GET /api/train/status for
    progress.  Returns 409 if training is already running.
    """
    with _training_lock:
        if _training_state["status"] == "running":
            raise HTTPException(
                status_code=409,
                detail="Training is already in progress. Poll /api/train/status.",
            )
        thread = threading.Thread(target=_run_training, daemon=True)
        thread.start()

    return {"message": "Training started.", "status_url": "/api/train/status"}


@router.get("/train/status")
def get_training_status():
    """Return the current state of the training job."""
    return dict(_training_state)


# ---------------------------------------------------------------------------
# Risk scoring endpoints
# ---------------------------------------------------------------------------

@router.post("/risk/run")
def run_risk_scoring(update_batches: bool = True):
    try:
        try:
            reload_model()  # Ensure the latest trained model is in memory
        except Exception as reload_exc:
            print(f"[risk/run] reload_model warning (using cached model): {reload_exc}")
        return update_all_gauge_predictions(update_batches=update_batches)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/risk/gauge/{gauge_key:path}/run")
def run_single_risk_scoring(gauge_key: str, update_batches: bool = True):
    try:
        try:
            reload_model()  # Ensure the latest trained model is in memory
        except Exception as reload_exc:
            print(f"[risk/gauge/run] reload_model warning (using cached model): {reload_exc}")
        return update_single_gauge_prediction(gauge_key, update_batches=update_batches)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
