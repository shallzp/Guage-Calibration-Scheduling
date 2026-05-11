from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.core.date_utils import parse_date


@dataclass(frozen=True)
class GaugeRiskFeatures:
    days_until_due: int
    overdue_count: int
    completion_rate: float
    avg_delay_days: float
    frequency_months: int
    is_overdue: int
    next_due_date: datetime | None
    # --- new fields ---
    max_delay_days: int
    history_size: int


def _normalized_status(value: Any) -> str:
    return str(value or "").strip().lower()


def extract_risk_features(gauge: dict[str, Any], *, today: datetime | None = None) -> GaugeRiskFeatures:
    if today is None:
        today = datetime.utcnow()

    schedule_table = list(gauge.get("schedule_table") or [])

    total_entries = 0
    completed_entries = 0
    overdue_count = 0
    delay_days: list[int] = []
    next_schedule: dict[str, Any] | None = None

    # Collect all non-completed rows for picking the best next_schedule later
    non_completed_rows: list[dict[str, Any]] = []

    for row in schedule_table:
        if not isinstance(row, dict):
            continue
        total_entries += 1
        status = _normalized_status(row.get("status"))

        if status == "completed":
            completed_entries += 1
            due_date = parse_date(row.get("due_date"))
            completion_date = parse_date(row.get("completion_date"))
            if due_date and completion_date:
                # Bug fix 1: only count positive delay (actual lateness, not early completions)
                d = (completion_date - due_date).days
                if d > 0:
                    delay_days.append(d)

                # Bug fix 3: a completed-but-late row is a historical overdue event
                if d > 0:
                    overdue_count += 1
                    
        elif status == "overdue":
            # Keep explicit "overdue" status handling (legacy / future-proofing)
            overdue_count += 1
            due_date = parse_date(row.get("due_date"))

        if status not in {"completed"}:
            non_completed_rows.append(row)

    # Bug fix 5: pick the non-completed row whose due date is closest to today
    if non_completed_rows:
        def _due_distance(r: dict[str, Any]) -> int:
            d = parse_date(r.get("due_date"))
            return abs((d.date() - today.date()).days) if d else 10_000_000

        next_schedule = min(non_completed_rows, key=_due_distance)

    # Bug fix 2: if the active schedule is already overdue, include it in delay_days
    if next_schedule is not None:
        active_due = parse_date(next_schedule.get("due_date"))
        active_status = _normalized_status(next_schedule.get("status"))
        if active_due is not None and today.date() > active_due.date() and active_status != "completed":
            active_delay = (today.date() - active_due.date()).days
            delay_days.append(active_delay)

    completion_rate = completed_entries / total_entries if total_entries > 0 else 0.0
    avg_delay = sum(delay_days) / len(delay_days) if delay_days else 0.0

    # New feature: max_delay_days (after delay_days list is fully built)
    max_delay_days = max(delay_days) if delay_days else 0

    # New feature: history_size — completed + overdue rows
    history_size = completed_entries + overdue_count

    next_due_date = parse_date((next_schedule or {}).get("due_date"))
    if next_due_date is None:
        next_due_date = parse_date(gauge.get("due_date"))

    days_until_due = 0
    if next_due_date is not None:
        days_until_due = (next_due_date.date() - today.date()).days

    # Bug fix 4: is_overdue must also fire when the active schedule is past-due
    is_overdue = 0
    if next_schedule is not None:
        active_due = parse_date(next_schedule.get("due_date"))
        active_status = _normalized_status(next_schedule.get("status"))
        if _normalized_status(next_schedule.get("status")) == "overdue":
            is_overdue = 1
        elif active_due is not None and today.date() > active_due.date() and active_status != "completed":
            is_overdue = 1

    frequency = gauge.get("frequency")
    try:
        frequency_months = int(frequency)
    except (TypeError, ValueError):
        frequency_months = 0

    return GaugeRiskFeatures(
        days_until_due=days_until_due,
        overdue_count=overdue_count,
        completion_rate=completion_rate,
        avg_delay_days=avg_delay,
        frequency_months=frequency_months,
        is_overdue=is_overdue,
        next_due_date=next_due_date,
        max_delay_days=max_delay_days,
        history_size=history_size,
    )
