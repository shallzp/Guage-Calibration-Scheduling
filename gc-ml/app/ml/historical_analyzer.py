"""
app/ml/historical_analyzer.py
------------------------------
Extracts and summarises historical completion/delay patterns from a gauge's
schedule_table.  Produces an immutable HistoricalMetrics dataclass that the
recommendation engine consumes.

Deliberately has no dependency on scorer.py or classifier.py — it only uses
parse_date from core utilities so it can be imported anywhere in the stack
without circular-import risk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.core.date_utils import parse_date


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class HistoricalMetrics:
    """Immutable snapshot of a gauge's historical calibration performance."""

    total_completions: int
    total_overdue_incidents: int
    overdue_rate: float            # fraction: 0.0 – 1.0

    # Delay statistics (positive = late, negative = early)
    avg_delay_days: float
    median_delay_days: float
    max_delay_days: int
    delay_std_dev: float

    # Pattern indicators
    consistent_delay: bool         # ≥70 % of completions were late
    delay_trend: str               # 'increasing' | 'stable' | 'improving' | 'insufficient_data'
    recent_avg_delay: float        # Average over last 3 completions

    # Raw sequences (useful for signal generation)
    delay_history: tuple[int, ...]        # chronological delays
    overdue_incidents: tuple[dict[str, Any], ...]  # {schedule_id, delay_days, due_date, completion_date}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def analyze_gauge_history(
    gauge: dict[str, Any],
    *,
    today: datetime | None = None,
) -> HistoricalMetrics:
    """Analyse schedule_table and return a HistoricalMetrics snapshot.

    Parameters
    ----------
    gauge:
        Raw gauge document from MongoDB.
    today:
        Reference datetime (defaults to ``datetime.utcnow()``). Used only
        for future-proofing (e.g. computing "age" of incidents).
    """
    if today is None:
        today = datetime.utcnow()

    schedule_table = list(gauge.get("schedule_table") or [])

    delay_days_list: list[int] = []
    overdue_incidents: list[dict[str, Any]] = []

    for entry in schedule_table:
        if not isinstance(entry, dict):
            continue

        status = str(entry.get("status") or "").strip().lower()
        if status != "completed":
            continue

        due_dt = parse_date(entry.get("due_date"))
        comp_dt = parse_date(entry.get("completion_date"))
        if due_dt is None or comp_dt is None:
            continue

        delay = (comp_dt.date() - due_dt.date()).days
        delay_days_list.append(delay)

        if delay > 0:
            overdue_incidents.append(
                {
                    "schedule_id": entry.get("schedule_id"),
                    "due_date": due_dt,
                    "completion_date": comp_dt,
                    "delay_days": delay,
                }
            )

    total_completions = len(delay_days_list)
    total_overdue = len(overdue_incidents)
    overdue_rate = total_overdue / total_completions if total_completions > 0 else 0.0

    avg_delay = _mean(delay_days_list)
    median_delay = _median(delay_days_list)
    max_delay = max(delay_days_list) if delay_days_list else 0
    std_dev = _stdev(delay_days_list, avg_delay)

    consistent_delay = _is_consistent_delay(delay_days_list)
    delay_trend = _calculate_trend(delay_days_list)
    recent_avg = _mean(delay_days_list[-3:]) if delay_days_list else 0.0

    return HistoricalMetrics(
        total_completions=total_completions,
        total_overdue_incidents=total_overdue,
        overdue_rate=overdue_rate,
        avg_delay_days=avg_delay,
        median_delay_days=median_delay,
        max_delay_days=max_delay,
        delay_std_dev=std_dev,
        consistent_delay=consistent_delay,
        delay_trend=delay_trend,
        recent_avg_delay=recent_avg,
        delay_history=tuple(delay_days_list),
        overdue_incidents=tuple(overdue_incidents),
    )


# ---------------------------------------------------------------------------
# Private helpers (pure functions, easy to unit-test)
# ---------------------------------------------------------------------------

def _mean(values: list[int]) -> float:
    return sum(values) / len(values) if values else 0.0


def _median(values: list[int]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return float(s[mid]) if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def _stdev(values: list[int], mean: float) -> float:
    if len(values) < 2:
        return 0.0
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return variance ** 0.5


def _is_consistent_delay(delay_days: list[int]) -> bool:
    """Return True when ≥70 % of completions were late."""
    if len(delay_days) < 3:
        return False
    positive = sum(1 for d in delay_days if d > 0)
    return (positive / len(delay_days)) >= 0.7


def _calculate_trend(delay_days: list[int]) -> str:
    """Compare the most-recent 3 entries to the older history."""
    if len(delay_days) < 3:
        return "insufficient_data"

    recent = delay_days[-3:]
    older = delay_days[:-3] if len(delay_days) > 3 else delay_days[:3]

    diff = _mean(recent) - _mean(older)

    if diff > 2:
        return "increasing"
    if diff < -2:
        return "improving"
    return "stable"
