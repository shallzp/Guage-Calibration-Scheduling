from __future__ import annotations
from typing import Any
from app.db.mongo_client import get_db

def update_current_batch_risk() -> int:
    """Recompute risk_summary and batch_risk for every document in current_batches.

    Reads the latest_prediction.risk_level for every gauge referenced in each
    batch and aggregates high / medium / low counts.  batch_risk is the ratio
    of (high + medium) gauges to total gauges in the batch (0.0 – 1.0).

    Returns the number of batch documents updated.
    """
    db = get_db()
    batches = list(db['current_batches'].find({}, {'_id': 1, 'gauge_keys': 1}))
    if not batches:
        return 0

    # Gather risk levels for all referenced gauge keys in one query
    all_gauge_keys = list({key for batch in batches for key in (batch.get('gauge_keys') or [])})
    risk_by_key: dict[str, str] = {}
    if all_gauge_keys:
        cursor = db['gauges'].find(
            {'gauge_key': {'$in': all_gauge_keys}},
            {'_id': 0, 'gauge_key': 1, 'latest_prediction.risk_level': 1},
        )
        for doc in cursor:
            key = str(doc.get('gauge_key') or '').strip()
            level = str((doc.get('latest_prediction') or {}).get('risk_level') or '').strip().lower()
            if key:
                risk_by_key[key] = level

    updated = 0
    for batch in batches:
        summary = {'high': 0, 'medium': 0, 'low': 0}
        gauge_keys = list(batch.get('gauge_keys') or [])
        for key in gauge_keys:
            level = risk_by_key.get(key, '')
            if level in summary:
                summary[level] += 1

        total = len(gauge_keys)
        batch_risk = round((summary['high'] + summary['medium']) / total, 4) if total > 0 else 0.0

        result = db['current_batches'].update_one(
            {'_id': batch['_id']},
            {'$set': {'risk_summary': summary, 'batch_risk': batch_risk}},
        )
        if result.modified_count > 0:
            updated += 1

    return updated
