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
from app.db.mongo_client import get_db

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
_overrun_model = None
_overrun_scaler = None
_overrun_cols = None

_rec_model = None
_rec_scaler = None
_rec_label_map = None
_rec_cols = None


def _load_models() -> None:
    global _overrun_model, _overrun_scaler, _overrun_cols
    global _rec_model, _rec_scaler, _rec_label_map, _rec_cols

    if _overrun_model is None:
        if not os.path.exists(OVERRUN_MODEL_PATH):
            raise FileNotFoundError("Overrun model not found. Run trainer.py first.")
        _overrun_model = joblib.load(OVERRUN_MODEL_PATH)
        _overrun_scaler = joblib.load(OVERRUN_SCALER_PATH)
        _overrun_cols = joblib.load(OVERRUN_FEATURES_PATH)

    if _rec_model is None:
        if not os.path.exists(REC_MODEL_PATH):
            raise FileNotFoundError("Recommendation model not found. Run trainer.py first.")
        _rec_model = joblib.load(REC_MODEL_PATH)
        _rec_scaler = joblib.load(REC_SCALER_PATH)
        meta = joblib.load(REC_METADATA_PATH)
        _rec_label_map = meta["label_map"]
        _rec_cols = meta["feature_cols"]


@dataclass
class RecommendationResult:
    action: str  # "increase_frequency" | "reschedule" | "no_change"
    reason: str
    recommended_frequency: int | None
    recommended_due_date: str | None
    predicted_overrun_days: float
    signals: list[str] = field(default_factory=list)


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
            due = _parse_date_safe(row.get("due_date"))
            comp = _parse_date_safe(row.get("completion_date"))
            if due and comp:
                return float(max((comp - due).days, 0))
    return 0.0


def _get_latest_previous_snapshot(gauge: dict) -> dict | None:
    batch_keys = gauge.get("batch_keys")
    if not isinstance(batch_keys, dict):
        return None

    previous_ids = [key for key, status in batch_keys.items() if status == "previous"]
    if not previous_ids:
        return None

    db = get_db()
    cursor = db["previous_batches"].find(
        {"_id": {"$in": previous_ids}},
        {"_id": 1, "date": 1, "snapshot": 1},
    ).sort("date", -1)

    gauge_key = str(gauge.get("gauge_key") or "").strip()
    for batch in cursor:
        for entry in batch.get("snapshot") or []:
            if str(entry.get("gauge_key") or "").strip() == gauge_key:
                return entry
    return None


def _snapshot_value(snapshot: dict | None, key: str, default: float = 0.0) -> float:
    if not isinstance(snapshot, dict):
        return default
    try:
        return float(snapshot.get(key))
    except (TypeError, ValueError):
        return default


def _merge_features_with_snapshot_delta(
    current: GaugeRiskFeatures,
    snapshot: dict | None,
) -> GaugeRiskFeatures:
    """
    Keep current features as primary input and blend only worsening historical
    signals from previous snapshot so recommendations use current-vs-previous trend.
    """
    if not isinstance(snapshot, dict):
        return current

    prev_avg_delay = _snapshot_value(snapshot, "avg_delay_days", current.avg_delay_days)
    prev_max_delay = _snapshot_value(snapshot, "max_delay_days", current.max_delay_days)
    prev_overdue = _snapshot_value(snapshot, "overdue_count", current.overdue_count)
    prev_history_size = _snapshot_value(snapshot, "history_size", current.history_size)
    prev_completion_rate = _snapshot_value(snapshot, "completion_rate", current.completion_rate)

    return GaugeRiskFeatures(
        days_until_due=current.days_until_due,
        overdue_count=int(max(current.overdue_count, prev_overdue)),
        completion_rate=float(min(current.completion_rate, prev_completion_rate)),
        avg_delay_days=float(max(current.avg_delay_days, prev_avg_delay)),
        frequency_months=current.frequency_months,
        is_overdue=current.is_overdue,
        next_due_date=current.next_due_date,
        max_delay_days=int(max(current.max_delay_days, prev_max_delay)),
        history_size=int(max(current.history_size, prev_history_size)),
    )


def _was_frequency_already_changed(
    current_features: GaugeRiskFeatures,
    snapshot: dict | None,
) -> bool:
    """
    Return True when current frequency is already higher than previous-batch
    snapshot frequency, meaning a prior increase has already been applied.
    """
    if not isinstance(snapshot, dict):
        return False
    prev_freq = _snapshot_value(snapshot, "frequency_at_batch", 0)
    return prev_freq > 0 and current_features.frequency_months > int(prev_freq)


def _predict_overrun(features: GaugeRiskFeatures) -> float:
    """Ridge Regression: predict expected overrun days."""
    x_dict = {col: getattr(features, col) for col in OVERRUN_FEATURE_COLS}
    X_df = pd.DataFrame([x_dict])[_overrun_cols]
    X_sc = _overrun_scaler.transform(X_df)
    return float(np.clip(_overrun_model.predict(X_sc)[0], 0, None))


def _predict_action(
    features: GaugeRiskFeatures,
    prev_delay: float,
    predicted_overrun: float,
) -> str:
    """RandomForest: predict recommendation action."""
    delay_ratio = predicted_overrun / _freq_days(features.frequency_months)

    x_dict = {
        "avg_delay_days": features.avg_delay_days,
        "max_delay_days": features.max_delay_days,
        "overdue_count": features.overdue_count,
        "completion_rate": features.completion_rate,
        "frequency_months": features.frequency_months,
        "history_size": features.history_size,
        "prev_batch_delay": prev_delay,
        "predicted_overrun": predicted_overrun,
        "delay_ratio": delay_ratio,
    }
    X_df = pd.DataFrame([x_dict])[_rec_cols]
    X_sc = _rec_scaler.transform(X_df)
    pred = int(_rec_model.predict(X_sc)[0])
    return _rec_label_map[pred]


def _build_signals(
    features: GaugeRiskFeatures,
    prev_delay: float,
    predicted_overrun: float,
    snapshot: dict | None = None,
    current_features: GaugeRiskFeatures | None = None,
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

    if isinstance(snapshot, dict) and current_features is not None:
        prev_avg = _snapshot_value(snapshot, "avg_delay_days", current_features.avg_delay_days)
        prev_overdue = int(_snapshot_value(snapshot, "overdue_count", current_features.overdue_count))
        avg_delta = current_features.avg_delay_days - prev_avg
        overdue_delta = current_features.overdue_count - prev_overdue
        if avg_delta > 0:
            signals.append(f"avg_delay_trend=+{avg_delta:.1f}d")
        if overdue_delta > 0:
            signals.append(f"overdue_trend=+{overdue_delta}")

    return signals


def _build_reason(
    action: str,
    features: GaugeRiskFeatures,
    prev_delay: float,
    predicted_overrun: float,
    snapshot: dict | None = None,
    current_features: GaugeRiskFeatures | None = None,
) -> str:
    trend_note = ""
    if isinstance(snapshot, dict) and current_features is not None:
        prev_avg = _snapshot_value(snapshot, "avg_delay_days", current_features.avg_delay_days)
        prev_overdue = int(_snapshot_value(snapshot, "overdue_count", current_features.overdue_count))
        avg_delta = current_features.avg_delay_days - prev_avg
        overdue_delta = current_features.overdue_count - prev_overdue
        if avg_delta > 0 or overdue_delta > 0:
            trend_note = (
                f" Compared with previous-batch snapshot, delay trend is worsening"
                f" ({avg_delta:+.1f}d avg delay, {overdue_delta:+d} overdue)."
            )

    if action == "increase_frequency":
        return (
            f"Gauge has {features.overdue_count} overdue event(s) with avg delay "
            f"{features.avg_delay_days:.1f}d. Predicted overrun is {predicted_overrun:.1f}d "
            f"against a {features.frequency_months}-month cycle; increasing the cycle length is recommended."
            f"{trend_note}"
        )
    if action == "reschedule":
        return (
            f"Gauge shows a manageable slip (~{predicted_overrun:.1f}d predicted, "
            f"{int(prev_delay)}d previous batch delay). "
            f"Rescheduling to the least-loaded batch within 1-3 days of the current due date."
            f"{trend_note}"
        )
    return "No significant overrun pattern detected. No change recommended."


def _get_current_schedule_due(gauge: dict) -> datetime | None:
    """
    Return the due date of the current active schedule row,
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
    Dates with no existing batch get load=0.
    """
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
    Pick the least-loaded batch in the 1-3 day window after the current
    active schedule due date and return it as DD/MM/YYYY.
    """
    current_due = _get_current_schedule_due(gauge)
    if current_due is None:
        return None

    candidates = [current_due + timedelta(days=i) for i in range(1, 4)]
    load_map = _get_batch_loads(candidates)

    best_date = min(
        candidates,
        key=lambda d: (load_map[f"BATCH-{d.strftime('%Y%m%d')}"], d),
    )
    return best_date.strftime("%d/%m/%Y")


def recommend(
    gauge: dict,
    features: GaugeRiskFeatures,
    risk_level: str,
) -> RecommendationResult:
    """Generate recommendation for one gauge. Called by classifier.py."""
    if risk_level.lower() == "low":
        return RecommendationResult(
            action="no_change",
            reason="Risk level is low; no action required.",
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

    snapshot = _get_latest_previous_snapshot(gauge)
    rec_features = _merge_features_with_snapshot_delta(features, snapshot)

    prev_delay = _get_prev_batch_delay(gauge)
    if snapshot:
        prev_delay = _snapshot_value(snapshot, "avg_delay_days", prev_delay)

    predicted_overrun = _predict_overrun(rec_features)
    action = _predict_action(rec_features, prev_delay, predicted_overrun)
    signals = _build_signals(
        rec_features,
        prev_delay,
        predicted_overrun,
        snapshot=snapshot,
        current_features=features,
    )
    reason = _build_reason(
        action,
        rec_features,
        prev_delay,
        predicted_overrun,
        snapshot=snapshot,
        current_features=features,
    )

    recommended_frequency = None
    recommended_due_date = None

    if action == "increase_frequency":
        if _was_frequency_already_changed(features, snapshot):
            action = "no_change"
            reason = (
                "Frequency was already increased compared with the previous batch snapshot. "
                "Skipping another frequency increase recommendation."
            )
        else:
            recommended_frequency = _suggest_new_frequency(features.frequency_months)
        if action == "increase_frequency" and recommended_frequency is None:
            action = "reschedule"
            reason = (
                f"Gauge is already at the maximum calibration cycle ({features.frequency_months} months). "
                "Cannot extend further; rescheduling to the least-loaded batch within 1-3 days instead."
            )

    if action == "reschedule":
        recommended_due_date = _compute_new_due_date(gauge)

    return RecommendationResult(
        action=action,
        reason=reason,
        recommended_frequency=recommended_frequency,
        recommended_due_date=recommended_due_date,
        predicted_overrun_days=round(predicted_overrun, 2),
        signals=signals,
    )
