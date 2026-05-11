from __future__ import annotations
from typing import Any
from app.db.mongo_client import get_db

def update_unified_batch_risk() -> int:
    """Recompute risk_summary, batch_risk, and snapshot risk fields for every
    document in the unified `batches` collection.

    Returns the number of batch documents updated.
    """
    db = get_db()
    batches = list(db['batches'].find({}, {'_id': 1, 'gauge_keys': 1, 'snapshot': 1}))
    if not batches:
        return 0

    # Fetch predictions for all referenced gauges in one query
    # In batches collection, gauge_keys is an array of dicts: { gauge_key, status }
    all_gauge_keys = set()
    for b in batches:
        for g in (b.get('gauge_keys') or []):
            k = g.get('gauge_key')
            if k:
                all_gauge_keys.add(k)
                
    all_gauge_keys = list(all_gauge_keys)

    predictions: dict[str, dict[str, Any]] = {}
    if all_gauge_keys:
        cursor = db['gauges'].find(
            {'gauge_key': {'$in': all_gauge_keys}},
            {
                '_id': 0,
                'gauge_key': 1,
                'latest_prediction.risk_score': 1,
                'latest_prediction.risk_level': 1,
            },
        )
        for doc in cursor:
            key = str(doc.get('gauge_key') or '').strip()
            if key:
                predictions[key] = doc.get('latest_prediction') or {}

    updated = 0
    for batch in batches:
        summary = {'high': 0, 'medium': 0, 'low': 0}
        gauge_keys_list = list(batch.get('gauge_keys') or [])
        
        for g in gauge_keys_list:
            key = g.get('gauge_key')
            if not key:
                continue
                
            pred = predictions.get(key) or {}
            level = str(pred.get('risk_level') or '').strip().lower()
            
            if level in summary:
                summary[level] += 1

        total = len(gauge_keys_list)
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
            })

        result = db['batches'].update_one(
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
