from __future__ import annotations

from datetime import datetime
from typing import Any

from app.db.repositories.gauge import (
    add_latest_prediction,
    add_ml_features,
    load_gauge_records_from_db,
)
from app.db.repositories.current_batches import update_current_batch_risk
from app.db.repositories.previous_batches import update_previous_batch_risk
from app.ml.classifier import build_risk_payload


def update_all_gauge_predictions(*, update_batches: bool = True) -> dict[str, Any]:
    gauges = load_gauge_records_from_db()
    updated = 0
    errors: list[str] = []

    for gauge in gauges:
        gauge_key = str(gauge.get("gauge_key") or "").strip()
        if not gauge_key:
            continue

        try:
            payload = build_risk_payload(gauge, today=datetime.utcnow())
            if not add_ml_features(gauge_key, payload["ml_features"]):
                errors.append(f"ml_features:{gauge_key}")
                continue
            if not add_latest_prediction(gauge_key, payload["latest_prediction"]):
                errors.append(f"latest_prediction:{gauge_key}")
                continue
            updated += 1
        except (ValueError, TypeError) as exc:
            errors.append(f"{gauge_key}:{exc}")

    current_risk_updated = 0
    previous_risk_updated = 0
    if update_batches:
        # Only update risk data on existing batch documents — do not rebuild structure
        current_risk_updated = update_current_batch_risk()
        previous_risk_updated = update_previous_batch_risk()

    return {
        "updated": updated,
        "total": len(gauges),
        "errors": errors,
        "current_risk_updated": current_risk_updated,
        "previous_risk_updated": previous_risk_updated,
    }
