from __future__ import annotations

import os
import joblib
import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from app.ml.feature_engineering import GaugeRiskFeatures
from app.core.config import ( 
    OVERRUN_MODEL_PATH,
    OVERRUN_SCALER_PATH,
    OVERRUN_FEATURES_PATH,
    REC_MODEL_PATH,
    REC_SCALER_PATH,
    REC_METADATA_PATH,
)
from app.core.date_utils import parse_date

# Paths are centralized in app.core.config

# Feature columns (must match trainer.py)
OVERRUN_FEATURE_COLS = [
    "avg_delay_days", "max_delay_days", "overdue_count",
    "completion_rate", "frequency_months", "history_size",
]

REC_FEATURE_COLS = [
    "avg_delay_days", "max_delay_days", "overdue_count",
    "completion_rate", "frequency_months", "history_size",
    "prev_batch_delay", "predicted_overrun", "delay_ratio",
]

VALID_FREQUENCIES = [1, 3, 4, 6, 12, 24]

# Lazy-loaded model state
_overrun_model  = None
_overrun_scaler = None
_overrun_cols   = None

_rec_model      = None
_rec_scaler     = None
_rec_label_map  = None
_rec_cols       = None


def _load_models() -> None:
    global _overrun_model, _overrun_scaler, _overrun_cols
    global _rec_model, _rec_scaler, _rec_label_map, _rec_cols

    if _overrun_model is None:
        if not os.path.exists(OVERRUN_MODEL_PATH):
            raise FileNotFoundError("Overrun model not found. Run trainer.py first.")
        _overrun_model  = joblib.load(OVERRUN_MODEL_PATH)
        _overrun_scaler = joblib.load(OVERRUN_SCALER_PATH)
        _overrun_cols   = joblib.load(OVERRUN_FEATURES_PATH)

    if _rec_model is None:
        if not os.path.exists(REC_MODEL_PATH):
            raise FileNotFoundError("Recommendation model not found. Run trainer.py first.")
        _rec_model    = joblib.load(REC_MODEL_PATH)
        _rec_scaler   = joblib.load(REC_SCALER_PATH)
        meta          = joblib.load(REC_METADATA_PATH)
        _rec_label_map = meta["label_map"]
        _rec_cols     = meta["feature_cols"]


# Result dataclass

@dataclass
class RecommendationResult:
    action: str                         # "increase_frequency" | "reschedule" | "no_change"
    reason: str                         # human-readable explanation
    recommended_frequency: int | None   # new frequency in months (increase_frequency only)
    recommended_due_date: str | None    # new due date string DD/MM/YYYY (reschedule only)
    predicted_overrun_days: float       # Ridge model output
    signals: list[str] = field(default_factory=list)


# Internal helpers

def _parse_date_safe(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict) and "$date" in value:
        raw = value["$date"]
        if isinstance(raw, datetime):
            return raw
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None
    try:
        return parse_date(value)
    except Exception:
        return None


def _freq_days(frequency_months: int) -> float:
    return max(frequency_months * 30, 1)


def _suggest_new_frequency(current_freq: int) -> int | None:
    """Return the next longer valid frequency, or None if already at maximum."""
    longer = [f for f in VALID_FREQUENCIES if f > current_freq]
    return min(longer) if longer else None


def _get_prev_batch_delay(gauge: dict) -> float:
    """Delay days from the most recently completed schedule row."""
    schedule_table = sorted(
        gauge.get("schedule_table", []),
        key=lambda r: int(r.get("schedule_id", 0)),
    )
    for row in reversed(schedule_table):
        if str(row.get("status", "")).strip().lower() == "completed":
            due  = _parse_date_safe(row.get("due_date"))
            comp = _parse_date_safe(row.get("completion_date"))
            if due and comp:
                return float(max((comp - due).days, 0))
    return 0.0


def _predict_overrun(features: GaugeRiskFeatures) -> float:
    """Ridge Regression: predict expected overrun days."""
    x_dict = {col: getattr(features, col) for col in OVERRUN_FEATURE_COLS}
    X_df   = pd.DataFrame([x_dict])[_overrun_cols]
    X_sc   = _overrun_scaler.transform(X_df)
    return float(np.clip(_overrun_model.predict(X_sc)[0], 0, None))


def _predict_action(
    features: GaugeRiskFeatures,
    prev_delay: float,
    predicted_overrun: float,
) -> str:
    """RandomForest: predict recommendation action."""
    delay_ratio = predicted_overrun / _freq_days(features.frequency_months)

    x_dict = {
        "avg_delay_days":    features.avg_delay_days,
        "max_delay_days":    features.max_delay_days,
        "overdue_count":     features.overdue_count,
        "completion_rate":   features.completion_rate,
        "frequency_months":  features.frequency_months,
        "history_size":      features.history_size,
        "prev_batch_delay":  prev_delay,
        "predicted_overrun": predicted_overrun,
        "delay_ratio":       delay_ratio,
    }
    X_df  = pd.DataFrame([x_dict])[_rec_cols]
    X_sc  = _rec_scaler.transform(X_df)
    pred  = int(_rec_model.predict(X_sc)[0])
    return _rec_label_map[pred]


def _build_signals(
    features: GaugeRiskFeatures,
    prev_delay: float,
    predicted_overrun: float,
) -> list[str]:
    signals = []
    if features.is_overdue:
        signals.append("currently_overdue")
    if features.overdue_count >= 2:
        signals.append(f"overdue_count={features.overdue_count}")
    if features.avg_delay_days > 14:
        signals.append(f"avg_delay={features.avg_delay_days:.1f}d")
    if predicted_overrun > 7:
        signals.append(f"predicted_overrun={predicted_overrun:.1f}d")
    if prev_delay > 0:
        signals.append(f"prev_batch_delay={int(prev_delay)}d")
    ratio = predicted_overrun / _freq_days(features.frequency_months)
    if ratio > 0.2:
        signals.append(f"delay_ratio={ratio:.2f}")
    return signals


def _build_reason(
    action: str,
    features: GaugeRiskFeatures,
    prev_delay: float,
    predicted_overrun: float,
) -> str:
    if action == "increase_frequency":
        return (
            f"Gauge has {features.overdue_count} overdue event(s) with avg delay "
            f"{features.avg_delay_days:.1f}d. Predicted overrun is {predicted_overrun:.1f}d "
            f"against a {features.frequency_months}-month cycle — increasing the cycle length is recommended."
        )
    if action == "reschedule":
        return (
            f"Gauge shows a manageable slip (~{predicted_overrun:.1f}d predicted, "
            f"{int(prev_delay)}d previous batch delay). "
            f"Rescheduling to the least-loaded batch within 1–3 days of the current due date."
        )
    return "No significant overrun pattern detected. No change recommended."


def _get_current_schedule_due(gauge: dict) -> datetime | None:
    """
    Return the due date of the current active schedule row —
    defined as the row immediately after the last completed row.
    """
    schedule_table = sorted(
        gauge.get("schedule_table", []),
        key=lambda r: int(r.get("schedule_id", 0)),
    )
    if not schedule_table:
        return None

    last_completed_index = -1
    for idx, row in enumerate(schedule_table):
        if str(row.get("status", "")).strip().lower() == "completed":
            last_completed_index = idx

    target_index = last_completed_index + 1
    if target_index >= len(schedule_table):
        return None

    return _parse_date_safe(schedule_table[target_index].get("due_date"))


def _get_batch_loads(candidate_dates: list) -> dict:
    """
    Query current_batches for gauge_count on each candidate date.
    Returns { "BATCH-YYYYMMDD": gauge_count }.
    Dates with no existing batch get load=0 (least loaded, safe to use).
    """
    from app.db.mongo_client import get_db
    batch_ids = [f"BATCH-{d.strftime('%Y%m%d')}" for d in candidate_dates]
    db = get_db()
    batches = list(db["current_batches"].find(
        {"_id": {"$in": batch_ids}},
        {"_id": 1, "gauge_count": 1},
    ))
    load_map = {b["_id"]: b.get("gauge_count", 0) for b in batches}
    for bid in batch_ids:
        if bid not in load_map:
            load_map[bid] = 0
    return load_map


def _compute_new_due_date(gauge: dict) -> str | None:
    """
    Pick the least-loaded batch in the 1–3 day window after the current
    active schedule due date, and return that date as the new due date.

    Steps:
      1. Get current active schedule due date (row after last completed).
      2. Build 3 candidates: due+1, due+2, due+3 (always future dates).
      3. Query current_batches gauge_count for each candidate.
      4. Pick the candidate with the lowest load (tie-break: earlier date).
    """
    current_due = _get_current_schedule_due(gauge)
    if current_due is None:
        return None

    candidates = [current_due + timedelta(days=i) for i in range(1, 4)]
    load_map   = _get_batch_loads(candidates)

    best_date = min(
        candidates,
        key=lambda d: (load_map[f"BATCH-{d.strftime('%Y%m%d')}"], d),
    )
    return best_date.strftime("%d/%m/%Y")


# Public API

def recommend(
    gauge: dict,
    features: GaugeRiskFeatures,
    risk_level: str,
) -> RecommendationResult:
    """
    Generate a recommendation for a single gauge.

    Called by classifier.py after risk scoring.
    Returns no_change immediately for low-risk gauges.

    Args:
        gauge:      Raw gauge document from MongoDB.
        features:   GaugeRiskFeatures already extracted by scorer.py.
        risk_level: "low" | "medium" | "high"
    """
    # Skip low-risk gauges — no recommendation needed
    if risk_level.lower() == "low":
        return RecommendationResult(
            action="no_change",
            reason="Risk level is low — no action required.",
            recommended_frequency=None,
            recommended_due_date=None,
            predicted_overrun_days=0.0,
        )

    try:
        _load_models()
    except FileNotFoundError as exc:
        return RecommendationResult(
            action="no_change",
            reason=f"Recommendation model unavailable: {exc}",
            recommended_frequency=None,
            recommended_due_date=None,
            predicted_overrun_days=0.0,
        )

    prev_delay        = _get_prev_batch_delay(gauge)
    predicted_overrun = _predict_overrun(features)
    action            = _predict_action(features, prev_delay, predicted_overrun)
    signals           = _build_signals(features, prev_delay, predicted_overrun)
    reason            = _build_reason(action, features, prev_delay, predicted_overrun)

    recommended_frequency = None
    recommended_due_date  = None

    if action == "increase_frequency":
        recommended_frequency = _suggest_new_frequency(features.frequency_months)
        if recommended_frequency is None:
            # Already at maximum cycle (24 months) — fall back to reschedule
            action = "reschedule"
            reason = (
                f"Gauge is already at the maximum calibration cycle ({features.frequency_months} months). "
                "Cannot extend further — rescheduling to the least-loaded batch within 1–3 days instead."
            )

    if action == "reschedule":
        # Pick the least-loaded batch within +1/+2/+3 days of the current schedule due date.
        # No shift_days needed — _compute_new_due_date queries batch loads and decides the date.
        recommended_due_date = _compute_new_due_date(gauge)

    return RecommendationResult(
        action=action,
        reason=reason,
        recommended_frequency=recommended_frequency,
        recommended_due_date=recommended_due_date,
        predicted_overrun_days=round(predicted_overrun, 2),
        signals=signals,
    )