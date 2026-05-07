"""
app/ml/active_delay_tracker.py
--------------------------------
Tracks real-time delay information for gauges whose next schedule entry is
currently past its due date.

Unlike historical delay stats (which are derived from *completed* entries),
active delay tracks the *live* overdue days for a gauge that is still
in-progress or not-started but has already missed its due date.

This runs on every scoring cycle (called from risk_services.py) to keep
``ml_features.active_delay_days`` fresh alongside the ML risk score.

Design notes
------------
- Pure function ``compute_active_delay(gauge)`` — no DB access, easy to test.
- ``persist_active_delay(gauge_key, delay_info)`` — writes to MongoDB using
  the existing ``get_db()`` / ``gauge_lookup_filter`` helpers from mongo_client,
  consistent with the rest of the codebase (no raw collection objects passed
  in from outside).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.date_utils import parse_date
from app.db.mongo_client import gauge_lookup_filter, get_db, sanitize_for_mongo, utc_timestamp


# ---------------------------------------------------------------------------
# Pure computation (no I/O)
# ---------------------------------------------------------------------------

def compute_active_delay(
    gauge: dict[str, Any],
    *,
    today: datetime | None = None,
) -> dict[str, Any]:
    """Compute live overdue days for a gauge's current active schedule entry.

    Parameters
    ----------
    gauge:
        Raw gauge document from MongoDB.
    today:
        Reference datetime (defaults to ``datetime.utcnow()``).

    Returns
    -------
    dict — empty if the gauge has no active (non-completed) schedule, otherwise::

        {
            "schedule_id":    int | None,
            "due_date":       str (ISO),
            "days_until_due": int,          # negative = overdue
            "delay_days":     int | None,   # only set when overdue
            "is_currently_overdue": bool,
            "computed_at":    datetime,
        }
    """
    if today is None:
        today = datetime.utcnow()

    schedule_table = list(gauge.get("schedule_table") or [])

    # First non-completed schedule entry is the current active one
    active: dict[str, Any] | None = None
    for entry in schedule_table:
        if not isinstance(entry, dict):
            continue
        status = str(entry.get("status") or "").strip().lower()
        if status in {"not-started", "in-progress", "overdue"}:
            active = entry
            break

    if active is None:
        return {}

    due_dt = parse_date(active.get("due_date"))
    if due_dt is None:
        return {}

    days_until_due = (due_dt.date() - today.date()).days
    is_overdue = days_until_due < 0
    delay_days: int | None = abs(days_until_due) if is_overdue else None

    return {
        "schedule_id": active.get("schedule_id"),
        "due_date": due_dt.date().isoformat(),
        "days_until_due": days_until_due,
        "delay_days": delay_days,
        "is_currently_overdue": is_overdue,
        "computed_at": today,
    }


# ---------------------------------------------------------------------------
# Persistence (uses existing mongo_client helpers)
# ---------------------------------------------------------------------------

def persist_active_delay(gauge_key: str, delay_info: dict[str, Any]) -> bool:
    """Write the live active-delay snapshot onto the gauge's ``ml_features``.

    This does **not** mutate ``schedule_table`` rows — it stores a lightweight
    snapshot inside ``ml_features.active_delay`` so the scoring API can return
    current overdue context without re-scanning the schedule.

    Returns True if the document was matched (regardless of whether a field
    actually changed).
    """
    if not gauge_key or not delay_info:
        return False

    snapshot = sanitize_for_mongo(
        {
            "schedule_id": delay_info.get("schedule_id"),
            "due_date": delay_info.get("due_date"),
            "days_until_due": delay_info.get("days_until_due"),
            "delay_days": delay_info.get("delay_days"),
            "is_currently_overdue": delay_info.get("is_currently_overdue"),
            "computed_at": delay_info.get("computed_at"),
        }
    )

    result = get_db()["gauges"].update_one(
        gauge_lookup_filter(gauge_key),
        {
            "$set": {
                "ml_features.active_delay": snapshot,
                "ml_features.days_until_due": delay_info.get("days_until_due"),
                "updated_at": utc_timestamp(),
            }
        },
    )
    return result.matched_count > 0


# ---------------------------------------------------------------------------
# Batch helper (used by risk_services.py)
# ---------------------------------------------------------------------------

def refresh_active_delays(gauges: list[dict[str, Any]], *, today: datetime | None = None) -> int:
    """Compute and persist active-delay snapshots for a list of gauge documents.

    Designed to be called from ``update_all_gauge_predictions`` so that every
    scoring cycle also refreshes the live overdue counters.

    Returns the number of gauges where an active (overdue) schedule was found
    and persisted.
    """
    if today is None:
        today = datetime.utcnow()

    refreshed = 0
    for gauge in gauges:
        gauge_key = str(gauge.get("gauge_key") or "").strip()
        if not gauge_key:
            continue

        delay_info = compute_active_delay(gauge, today=today)
        if not delay_info:
            continue  # no active schedule — nothing to track

        if persist_active_delay(gauge_key, delay_info):
            refreshed += 1

    return refreshed
