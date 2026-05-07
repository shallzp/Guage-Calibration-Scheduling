from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import sqrt
from typing import Any

from app.core.date_utils import parse_date

# Temporal decay half-life in days.
# A failure that occurred DECAY_HALF_LIFE_DAYS ago is weighted 50% of a failure today.
DECAY_HALF_LIFE_DAYS: float = 365.0


@dataclass(frozen=True)
class GaugeRiskFeatures:
    days_until_due: int
    overdue_count: int
    # Exponentially-decayed overdue score — recent failures count more.
    decayed_overdue_score: float
    completion_rate: float
    avg_delay_days: float
    frequency_months: int
    is_overdue: int
    next_due_date: datetime | None
    # Total number of historical records (completed + overdue).  Used to
    # compute the confidence-interval margin of error in scorer.py.
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
    decayed_overdue_score: float = 0.0
    delay_days: list[int] = []
    next_schedule: dict[str, Any] | None = None

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
                delay_days.append((completion_date - due_date).days)

        elif status == "overdue":
            overdue_count += 1
            # Apply exponential temporal decay based on how long ago this
            # schedule row was due.  More-recent failures carry more weight.
            due_date = parse_date(row.get("due_date"))
            if due_date is not None:
                days_ago = max(0.0, (today - due_date).total_seconds() / 86_400)
            else:
                days_ago = 0.0
            decayed_overdue_score += (0.5 ** (days_ago / DECAY_HALF_LIFE_DAYS))

        if next_schedule is None and status in {"not-started", "in-progress", "overdue"}:
            next_schedule = row

    # history_size = entries that actually carry useful signal (completed or overdue)
    history_size = completed_entries + overdue_count

    completion_rate = completed_entries / total_entries if total_entries > 0 else 0.0

    avg_delay = sum(delay_days) / len(delay_days) if delay_days else 0.0

    next_due_date = parse_date((next_schedule or {}).get("due_date"))
    if next_due_date is None:
        next_due_date = parse_date(gauge.get("due_date"))

    days_until_due = 0
    if next_due_date is not None:
        days_until_due = (next_due_date.date() - today.date()).days

    is_overdue = 1 if _normalized_status((next_schedule or {}).get("status")) == "overdue" else 0

    frequency = gauge.get("frequency")
    try:
        frequency_months = int(frequency)
    except (TypeError, ValueError):
        frequency_months = 0

    return GaugeRiskFeatures(
        days_until_due=days_until_due,
        overdue_count=overdue_count,
        decayed_overdue_score=decayed_overdue_score,
        completion_rate=completion_rate,
        avg_delay_days=avg_delay,
        frequency_months=frequency_months,
        is_overdue=is_overdue,
        next_due_date=next_due_date,
        history_size=history_size,
    )

