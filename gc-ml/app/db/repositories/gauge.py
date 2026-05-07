from __future__ import annotations
from typing import Any

from app.db.mongo_client import gauge_lookup_filter, get_db, sanitize_for_mongo, utc_timestamp


def load_gauge_records_from_db() -> list[dict[str, Any]]:
    documents = list(get_db()['gauges'].find({}, {'_id': 0}))
    
    if not documents:
        raise RuntimeError('No gauge records found in MongoDB.')
    return documents


def apply_frequency_recommendation(gauge_key: str, new_frequency: Any) -> bool:
    if not gauge_key:
        return False

    try:
        frequency = int(new_frequency)
    except (TypeError, ValueError):
        return False

    result = get_db()["gauges"].update_one(
        gauge_lookup_filter(gauge_key),
        {
            "$set": {
                "frequency": frequency,
                "updated_at": utc_timestamp(),
            }
        },
    )
    return result.modified_count > 0


def _with_rescheduled_row( schedule_table: list[dict[str, Any]], *, new_due_date: str, current_due_date: str | None ) -> tuple[list[dict[str, Any]], bool]:
    if not schedule_table:
        return schedule_table, False

    normalized_current_due = (
        str(current_due_date).strip() if current_due_date is not None else None
    )

    target_index: int | None = None
    for index, row in enumerate(schedule_table):
        status = str(row.get('status', '')).strip().lower()
        due_date = str(row.get('due_date', '')).strip()

        if status == 'completed':
            continue
        if normalized_current_due is not None and due_date != normalized_current_due:
            continue

        target_index = index
        break

    if target_index is None and normalized_current_due is not None:
        for index, row in enumerate(schedule_table):
            status = str(row.get('status', '')).strip().lower()
            if status != 'completed':
                target_index = index
                break

    if target_index is None:
        return schedule_table, False

    updated_rows = [dict(row) for row in schedule_table]
    target_row = updated_rows[target_index]
    target_row['due_date'] = str(new_due_date)

    return updated_rows, True


def apply_reschedule_recommendation( gauge_key: str, new_due_date: Any, *, current_due_date: str | None = None ) -> bool:
    if not gauge_key or new_due_date is None:
        return False

    collection = get_db()['gauges']
    document = collection.find_one(
        gauge_lookup_filter(gauge_key),
        {'_id': 0, 'schedule_table': 1},
    )
    if document is None:
        return False

    schedule_table = list(document.get('schedule_table') or [])
    updated_schedule, updated_row = _with_rescheduled_row(
        schedule_table,
        new_due_date=str(new_due_date),
        current_due_date=current_due_date,
    )

    update_fields: dict[str, Any] = {
        'due_date': str(new_due_date),
        'updated_at': utc_timestamp(),
    }
    if updated_row:
        update_fields['schedule_table'] = updated_schedule

    result = collection.update_one(
        gauge_lookup_filter(gauge_key),
        {'$set': sanitize_for_mongo(update_fields)},
    )
    if result.matched_count > 0:
        return True
    return False


def add_ml_features(gauge_key: str, ml_features: dict[str, Any]) -> bool:
    if not gauge_key or not isinstance(ml_features, dict):
        return False

    result = get_db()['gauges'].update_one(
        gauge_lookup_filter(gauge_key),
        {
            '$set': sanitize_for_mongo(
                {
                    'ml_features': ml_features,
                    'updated_at': utc_timestamp(),
                }
            )
        },
    )
    return result.matched_count > 0


def add_latest_prediction(gauge_key: str, latest_prediction: dict[str, Any]) -> bool:
    if not gauge_key or not isinstance(latest_prediction, dict):
        return False

    payload = dict(latest_prediction)
    payload.setdefault('scored_at', utc_timestamp())

    result = get_db()['gauges'].update_one(
        gauge_lookup_filter(gauge_key),
        {
            '$set': sanitize_for_mongo(
                {
                    'latest_prediction': payload,
                    'updated_at': utc_timestamp(),
                }
            )
        },
    )
    return result.matched_count > 0
