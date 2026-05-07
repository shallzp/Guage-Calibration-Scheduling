"""
app/ml/recommender.py
---------------------
Scoring engine for the three recommendation action types.

Dependency chain (no circular imports):
    historical_analyzer  ←  recommender  ←  recommendation_engine
                                              ↑
                                          classifier (risk scoring)

ActionType       — enum of possible actions
RecommendationResult — frozen dataclass returned by GaugeRecommender
GaugeRecommender — main scoring class; call .generate_recommendation()
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from app.ml.historical_analyzer import HistoricalMetrics


# ---------------------------------------------------------------------------
# Enums & dataclasses
# ---------------------------------------------------------------------------

class ActionType(str, Enum):
    FREQUENCY_INCREASE = "frequency_increase"
    RESCHEDULE = "reschedule"
    NO_CHANGE = "no_change"


@dataclass(frozen=True)
class RecommendationResult:
    """Complete, immutable recommendation output from GaugeRecommender."""

    action: ActionType
    confidence: float              # winning score, 0.0–1.0

    parameters: dict[str, Any]    # action-specific params (empty for NO_CHANGE)
    reasoning: str                 # human-readable explanation
    supporting_data: dict[str, Any]
    action_scores: dict[str, float]  # score per action type

    generated_at: datetime


# ---------------------------------------------------------------------------
# Frequency ladder (used when choosing the next-lower calibration frequency)
# ---------------------------------------------------------------------------
_FREQ_LADDER: tuple[int, ...] = (1, 2, 3, 4, 6, 12, 24)


# ---------------------------------------------------------------------------
# Main recommender class
# ---------------------------------------------------------------------------

class GaugeRecommender:
    """
    Hybrid rule-based + weighted-scoring recommender.

    Scoring weights
    ---------------
    historical_overdue_rate  35 %
    avg_delay_days           25 %
    current_risk_score       20 %
    delay_trend              10 %
    consistency              10 %
    """

    # -- Configurable thresholds (easy to unit-test by subclassing) ----------
    HIGH_RISK_THRESHOLD: float = 75.0    # 0-100 model-probability scale
    MEDIUM_RISK_THRESHOLD: float = 40.0  # same scale
    SMALL_DELAY_MAX: int = 5             # days

    SIGNIFICANT_DELAY_RATIO: float = 0.20  # delay > 20 % of freq gap → significant

    WEIGHT_OVERDUE_RATE: float = 0.35
    WEIGHT_AVG_DELAY: float = 0.25
    WEIGHT_RISK_SCORE: float = 0.20
    WEIGHT_TREND: float = 0.10
    WEIGHT_CONSISTENCY: float = 0.10

    def __init__(
        self,
        historical: HistoricalMetrics,
        current_risk_score: float,
        current_frequency_months: int,
        days_until_due: int,
        frequency_gap_days: int,
        next_due_date: str | None = None,
    ) -> None:
        self.history = historical
        self.risk_score = current_risk_score
        self.frequency_months = current_frequency_months
        self.days_until_due = days_until_due
        self.frequency_gap_days = max(1, frequency_gap_days)
        self.next_due_date = next_due_date

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_recommendation(self, *, today: datetime | None = None) -> RecommendationResult:
        if today is None:
            today = datetime.utcnow()

        freq_score = self._score_frequency_increase()
        reschedule_score = self._score_reschedule()
        no_change_score = self._score_no_change()

        action_scores = {
            ActionType.FREQUENCY_INCREASE.value: freq_score,
            ActionType.RESCHEDULE.value: reschedule_score,
            ActionType.NO_CHANGE.value: no_change_score,
        }

        best_key = max(action_scores, key=action_scores.__getitem__)
        best_action = ActionType(best_key)
        confidence = round(action_scores[best_key], 4)

        if best_action == ActionType.FREQUENCY_INCREASE:
            parameters = self._params_frequency()
        elif best_action == ActionType.RESCHEDULE:
            parameters = self._params_reschedule()
        else:
            parameters = {}

        return RecommendationResult(
            action=best_action,
            confidence=confidence,
            parameters=parameters,
            reasoning=self._reasoning(best_action),
            supporting_data=self._supporting_data(),
            action_scores={k: round(v, 4) for k, v in action_scores.items()},
            generated_at=today,
        )

    # ------------------------------------------------------------------
    # Action scoring
    # ------------------------------------------------------------------

    def _score_frequency_increase(self) -> float:
        score = 0.0

        # 1. Historical overdue rate → up to 35 pts
        score += self.history.overdue_rate * self.WEIGHT_OVERDUE_RATE * 100

        # 2. Avg delay relative to frequency gap → up to 25 pts
        delay_ratio = min(
            self.history.avg_delay_days / (self.frequency_gap_days * self.SIGNIFICANT_DELAY_RATIO),
            1.0,
        )
        score += delay_ratio * self.WEIGHT_AVG_DELAY * 100

        # 3. Current risk score (0-100 model scale) → up to 20 pts
        risk_norm = min(self.risk_score / 100.0, 1.0)
        score += risk_norm * self.WEIGHT_RISK_SCORE * 100

        # 4. Delay trend → up to 10 pts
        if self.history.delay_trend == "increasing":
            score += self.WEIGHT_TREND * 100
        elif self.history.delay_trend == "stable":
            score += self.WEIGHT_TREND * 50

        # 5. Consistency bonus → up to 10 pts
        if self.history.consistent_delay:
            score += self.WEIGHT_CONSISTENCY * 100

        # Penalty: already at maximum frequency (can't give more time)
        if self.frequency_months >= 24:
            score *= 0.3

        return min(score / 100.0, 1.0)

    def _score_reschedule(self) -> float:
        score = 0.0
        avg_delay = self.history.avg_delay_days

        if 1 <= avg_delay <= self.SMALL_DELAY_MAX:
            score += 0.40

            if self.history.consistent_delay:
                score += 0.25

            if self.history.delay_trend in {"stable", "improving"}:
                score += 0.20

            if self.risk_score >= self.HIGH_RISK_THRESHOLD:
                score *= 0.25   # Frequency increase is probably better
            elif self.risk_score < self.MEDIUM_RISK_THRESHOLD:
                score += 0.15

        elif avg_delay > self.SMALL_DELAY_MAX:
            score = 0.0  # Large delays → frequency increase is the right tool

        return min(score, 1.0)

    def _score_no_change(self) -> float:
        score = 0.0

        if self.history.overdue_rate < 0.2:
            score += 0.40

        if self.risk_score < self.MEDIUM_RISK_THRESHOLD:
            score += 0.30

        if self.history.delay_trend == "improving":
            score += 0.20

        if self.history.avg_delay_days < 2:
            score += 0.10

        return min(score, 1.0)

    # ------------------------------------------------------------------
    # Parameter builders
    # ------------------------------------------------------------------

    def _params_frequency(self) -> dict[str, Any]:
        """Recommend extending the calibration interval (more months).

        A gauge that consistently misses deadlines needs MORE time between
        calibrations, not less — so we step UP the frequency ladder.
        The bigger the delay relative to the current cycle, the larger
        the increase.
        """
        current = self.frequency_months
        freq_gap_days = max(1, current * 30)
        delay_ratio = self.history.avg_delay_days / freq_gap_days

        # How many steps to increase on the ladder
        if delay_ratio > 0.5 or self.history.overdue_rate > 0.7:
            increase = 3   # Aggressive: delays are very large relative to cycle
        elif delay_ratio > 0.3 or self.history.overdue_rate > 0.5:
            increase = 2   # Moderate
        else:
            increase = 1   # Conservative: small but consistent delays

        # Find the nearest step on the frequency ladder ABOVE current
        target = current + increase
        candidates = [f for f in _FREQ_LADDER if f > current]
        new_freq = min(candidates, key=lambda f: abs(f - target)) if candidates else target

        return {
            "current_frequency_months": current,
            "recommended_frequency_months": new_freq,
            "increase_months": new_freq - current,
            "delay_ratio": round(delay_ratio, 3),
            "rationale": (
                f"Gauge takes ~{self.history.avg_delay_days:.1f} day(s) longer than the "
                f"{current}-month ({freq_gap_days}-day) window allows. "
                f"Extending to {new_freq} months gives the team more time to complete calibration."
            ),
        }

    def _params_reschedule(self) -> dict[str, Any]:
        median = self.history.median_delay_days
        offset = 3 if median >= 3 else (2 if median >= 2 else 1)

        new_due: str | None = None
        if self.next_due_date:
            try:
                due_dt = datetime.fromisoformat(str(self.next_due_date))
                new_due = (due_dt - timedelta(days=offset)).date().isoformat()
            except ValueError:
                pass

        return {
            "offset_days": offset,
            "direction": "earlier",
            "median_delay_days": round(median, 1),
            "current_due_date": self.next_due_date,
            "recommended_due_date": new_due,
            "explanation": (
                f"Shift due date {offset} day(s) earlier to align with "
                f"observed completion pattern (median delay: {median:.1f} days)."
            ),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _reasoning(self, action: ActionType) -> str:
        h, r, f = self.history, self.risk_score, self.frequency_months
        if action == ActionType.FREQUENCY_INCREASE:
            return (
                f"Gauge shows {h.overdue_rate:.1%} overdue rate with "
                f"average {h.avg_delay_days:.1f} day(s) beyond the due date. "
                f"Trend: {h.delay_trend}. Risk score: {r:.1f}. "
                f"Extending the calibration interval gives the team more time "
                f"to complete calibration without going overdue."
            )
        if action == ActionType.RESCHEDULE:
            return (
                f"Gauge has consistent small delays "
                f"(median: {h.median_delay_days:.1f} days). "
                f"Risk score is manageable ({r:.1f}). "
                f"Shifting the due date by 1-3 days aligns schedule with "
                f"operational patterns without changing frequency."
            )
        # NO_CHANGE
        return (
            f"Gauge performing well: {h.overdue_rate:.1%} overdue rate, "
            f"avg delay {h.avg_delay_days:.1f} days. "
            f"Risk score: {r:.1f}. "
            f"Current {f}-month frequency is appropriate."
        )

    def _supporting_data(self) -> dict[str, Any]:
        return {
            "historical": {
                "total_completions": self.history.total_completions,
                "overdue_rate": round(self.history.overdue_rate, 4),
                "avg_delay_days": round(self.history.avg_delay_days, 2),
                "median_delay_days": round(self.history.median_delay_days, 1),
                "delay_trend": self.history.delay_trend,
                "consistent_delay": self.history.consistent_delay,
                "recent_avg_delay": round(self.history.recent_avg_delay, 1),
            },
            "current": {
                "risk_score": round(self.risk_score, 2),
                "frequency_months": self.frequency_months,
                "days_until_due": self.days_until_due,
                "is_overdue": self.days_until_due < 0,
            },
        }
