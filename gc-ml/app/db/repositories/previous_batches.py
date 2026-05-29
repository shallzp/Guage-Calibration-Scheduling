from __future__ import annotations
from typing import Any
from app.db.mongo_client import get_db

def update_previous_batch_risk() -> int:
    """Recompute risk_summary, batch_risk, and snapshot risk fields for every
    document in previous_batches.

    Reads the latest_prediction for every gauge referenced in each batch's
    snapshot and writes:
      - risk_summary: aggregated high / medium / low counts
      - batch_risk: (high + medium) / total ratio (0.0 – 1.0)
      - snapshot[*]: per-row risk_score, risk_level, action,
        recommended_frequency, recommended_due_date

    Returns the number of batch documents updated.
    """
    db = get_db()
    batches = list(db['previous_batches'].find({}, {'_id': 1, 'gauge_keys': 1, 'snapshot': 1}))
    if not batches:
        return 0

    # Fetch predictions for all referenced gauges in one query
    all_gauge_keys = list({key for b in batches for key in (b.get('gauge_keys') or [])})
    predictions: dict[str, dict[str, Any]] = {}
    if all_gauge_keys:
        cursor = db['gauges'].find(
            {'gauge_key': {'$in': all_gauge_keys}},
            {
                '_id': 0,
                'gauge_key': 1,
                'latest_prediction.risk_score': 1,
                'latest_prediction.risk_level': 1,
                'latest_prediction.action': 1,
                'latest_prediction.recommended_frequency': 1,
                'latest_prediction.recommended_due_date': 1,
            },
        )
        for doc in cursor:
            key = str(doc.get('gauge_key') or '').strip()
            if key:
                predictions[key] = doc.get('latest_prediction') or {}

    updated = 0
    for batch in batches:
        summary = {'high': 0, 'medium': 0, 'low': 0}
        gauge_keys = list(batch.get('gauge_keys') or [])

        for key in gauge_keys:
            level = str((predictions.get(key) or {}).get('risk_level') or '').strip().lower()
            if level in summary:
                summary[level] += 1

        total = len(gauge_keys)
        batch_risk = round((summary['high'] * 1.0 + summary['medium'] * 0.5 + summary['low'] * 0.0) / total, 4) if total > 0 else 0.0

        # Patch snapshot rows with per-gauge prediction data
        updated_snapshot = []
        for entry in (batch.get('snapshot') or []):
            key = str(entry.get('gauge_key') or '').strip()
            pred = predictions.get(key) or {}
            updated_snapshot.append({
                **entry,
                'risk_score': pred.get('risk_score'),
                'risk_level': pred.get('risk_level'),
                'action': pred.get('action'),
                'recommended_frequency': pred.get('recommended_frequency'),
                'recommended_due_date': pred.get('recommended_due_date'),
            })

        result = db['previous_batches'].update_one(
            {'_id': batch['_id']},
            {'$set': {
                'risk_summary': summary,
                'batch_risk': batch_risk,
                'snapshot': updated_snapshot,
            }},
        )
        if result.modified_count > 0:
            updated += 1

    return updated
