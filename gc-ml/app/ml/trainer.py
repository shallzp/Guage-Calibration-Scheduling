from __future__ import annotations

import os
import joblib
import numpy as np
import pandas as pd

from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, mean_absolute_error

from app.db.mongo_client import get_db, close_connection
from app.ml.feature_engineering import extract_risk_features
from app.core.config import (
    MODEL_DIR,
    MODEL_PATH,
    FEATURES_PATH,
    METADATA_PATH,
    RISK_SCALER_PATH as CFG_RISK_SCALER_PATH,
    OVERRUN_MODEL_PATH as CFG_OVERRUN_MODEL_PATH,
    OVERRUN_SCALER_PATH as CFG_OVERRUN_SCALER_PATH,
    OVERRUN_FEATURES_PATH as CFG_OVERRUN_FEATURES_PATH,
    REC_MODEL_PATH as CFG_REC_MODEL_PATH,
    REC_SCALER_PATH as CFG_REC_SCALER_PATH,
    REC_METADATA_PATH as CFG_REC_METADATA_PATH,
)
from app.core.date_utils import parse_date
from datetime import datetime
from collections import Counter

# ============================================================================
# PATHS
# ============================================================================

# Risk paths (unchanged — same variables scorer.py already references)
RISK_MODEL_PATH    = MODEL_PATH
RISK_SCALER_PATH   = CFG_RISK_SCALER_PATH
RISK_FEATURES_PATH = FEATURES_PATH
RISK_METADATA_PATH = METADATA_PATH

# Overrun model paths (new)
OVERRUN_MODEL_PATH    = CFG_OVERRUN_MODEL_PATH
OVERRUN_SCALER_PATH   = CFG_OVERRUN_SCALER_PATH
OVERRUN_FEATURES_PATH = CFG_OVERRUN_FEATURES_PATH

# Recommendation model paths (new)
REC_MODEL_PATH    = CFG_REC_MODEL_PATH
REC_SCALER_PATH   = CFG_REC_SCALER_PATH
REC_METADATA_PATH = CFG_REC_METADATA_PATH

# ============================================================================
# FEATURE COLUMN DEFINITIONS
# ============================================================================

# NOTE: FEATURE_COLS kept for backward compatibility with build_training_data
FEATURE_COLS = [
    "days_until_due",
    "overdue_count",
    "completion_rate",
    "avg_delay_days",
    "frequency_months",
    "is_overdue",
    "max_delay_days",
    "history_size",
]

OVERRUN_FEATURE_COLS = [
    "avg_delay_days",
    "max_delay_days",
    "overdue_count",
    "completion_rate",
    "frequency_months",
    "history_size",
]

REC_FEATURE_COLS = [
    "avg_delay_days",
    "max_delay_days",
    "overdue_count",
    "completion_rate",
    "frequency_months",
    "history_size",
    "prev_batch_delay",    # delay from most recently completed schedule row
    "predicted_overrun",   # Ridge model output
    "delay_ratio",         # predicted_overrun / (frequency_months * 30)
]

REC_LABEL_MAP = {0: "no_change", 1: "reschedule", 2: "increase_frequency"}

VALID_FREQUENCIES = [1, 3, 4, 6, 12, 24]

# ============================================================================
# SHARED HELPERS  (used by overrun + recommendation sections only)
# ============================================================================

def _parse_date_safe(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict) and "$date" in value:
        raw = value["$date"]
        if isinstance(raw, datetime):
            return raw
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None
    try:
        return parse_date(value)
    except Exception:
        return None


def _freq_days(frequency_months: int) -> float:
    return max(frequency_months * 30, 1)


def _get_prev_batch_delay(gauge: dict) -> float:
    """Delay days from the most recently completed schedule row."""
    schedule_table = sorted(
        gauge.get("schedule_table", []),
        key=lambda r: int(r.get("schedule_id", 0)),
    )
    for row in reversed(schedule_table):
        if str(row.get("status", "")).strip().lower() == "completed":
            due  = _parse_date_safe(row.get("due_date"))
            comp = _parse_date_safe(row.get("completion_date"))
            if due and comp:
                return float(max((comp - due).days, 0))
    return 0.0


# ============================================================================
# SECTION 1 — RISK MODEL  (Logistic Regression)
# Identical to original trainer.py — zero changes
# ============================================================================

def _rule_label(f: dict) -> int:
    """
    Returns 0=LOW, 1=MEDIUM, 2=HIGH based on deterministic rules.
    This is used to generate training labels from unlabelled gauge data.
    The ML model then learns to generalise beyond these rules.
    """
    score = 0

    if f["is_overdue"]:
        score += 50
    if f["days_until_due"] < 0:
        score += 30
    elif f["days_until_due"] <= 15:
        score += 20
    elif f["days_until_due"] <= 30:
        score += 10

    if f["avg_delay_days"] > 45:
        score += 20
    elif f["avg_delay_days"] > 14:
        score += 10

    if f["overdue_count"] >= 2:
        score += 20
    elif f["overdue_count"] == 1:
        score += 10

    if f["completion_rate"] < 0.5:
        score += 15
    elif f["completion_rate"] < 0.75:
        score += 5

    if f["max_delay_days"] > 60:
        score += 10
    elif f["max_delay_days"] > 30:
        score += 5

    if f["frequency_months"] <= 3:
        score += 10
    elif f["frequency_months"] <= 6:
        score += 5

    if score >= 60:
        return 2   # HIGH
    if score >= 30:
        return 1   # MEDIUM
    return 0       # LOW


def build_training_data() -> tuple[pd.DataFrame, pd.Series]:
    """Build training dataset for the risk model — unchanged from original."""
    db = get_db()
    gauges = list(db.gauges.find({}))

    X_records: list[dict] = []
    y_records: list[int] = []

    for gauge in gauges:
        schedule_table = gauge.get("schedule_table", [])
        schedule_table = sorted(
            schedule_table, key=lambda r: int(r.get("schedule_id", 0))
        )

        today = datetime.utcnow()
        features = extract_risk_features(gauge, today=today)

        x_dict = {col: getattr(features, col) for col in FEATURE_COLS}
        label = _rule_label(x_dict)

        X_records.append(x_dict)
        y_records.append(label)

        if len(schedule_table) >= 4:
            for i in range(2, len(schedule_table)):
                target_row = schedule_table[i]
                target_due = parse_date(target_row.get("due_date"))
                if not target_due:
                    continue

                history_rows = schedule_table[:i]
                temp_gauge = {
                    "schedule_table": history_rows,
                    "frequency": gauge.get("frequency", 0),
                    "due_date": target_row.get("due_date"),
                }
                feat = extract_risk_features(temp_gauge, today=target_due)
                xd = {col: getattr(feat, col) for col in FEATURE_COLS}
                y_records.append(_rule_label(xd))
                X_records.append(xd)

    return pd.DataFrame(X_records, columns=FEATURE_COLS), pd.Series(y_records)


def train_risk_model() -> None:
    """Train Logistic Regression risk classifier — original logic, unchanged."""
    print("\n-- RISK MODEL (Logistic Regression) --------------------------")
    print("Extracting data from MongoDB...")
    X, y = build_training_data()

    if len(X) == 0:
        print("No training data found. Aborting.")
        return

    label_names = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    counts = y.value_counts().sort_index()
    print(f"Samples: {len(X)}")
    for k, v in counts.items():
        print(f"  {label_names[k]}: {v}")

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(
        solver="lbfgs",
        max_iter=1000,
        C=1.0,
        class_weight="balanced",
        random_state=42,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(model, X_scaled, y, cv=cv, scoring="f1_macro")
    print(f"\nCross-val F1 (macro): {scores.mean():.3f} ± {scores.std():.3f}")

    model.fit(X_scaled, y)
    y_pred = model.predict(X_scaled)
    print("\nTraining classification report:")
    print(classification_report(y, y_pred, target_names=["LOW", "MEDIUM", "HIGH"]))

    high_class_idx = list(model.classes_).index(2)
    proba_high = model.predict_proba(X_scaled)[:, high_class_idx] * 100.0
    HIGH_CUTOFF   = float(np.percentile(proba_high, 60))
    MEDIUM_CUTOFF = float(np.percentile(proba_high, 30))
    print(f"\nAuto-calibrated thresholds -> HIGH >= {HIGH_CUTOFF:.1f}, MEDIUM >= {MEDIUM_CUTOFF:.1f}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model,           RISK_MODEL_PATH)
    joblib.dump(list(X.columns), RISK_FEATURES_PATH)
    joblib.dump(scaler,          RISK_SCALER_PATH)
    joblib.dump(
        {"HIGH_RISK_CUTOFF": HIGH_CUTOFF, "MEDIUM_RISK_CUTOFF": MEDIUM_CUTOFF},
        RISK_METADATA_PATH,
    )
    print(f"Risk model  -> {RISK_MODEL_PATH}")
    print(f"Risk scaler -> {RISK_SCALER_PATH}")


# ============================================================================
# SECTION 2 — OVERRUN MODEL  (Ridge Regression)
# Predicts expected overrun days using real historical delay labels
# ============================================================================

def _build_overrun_training_data(gauges: list[dict]) -> tuple[pd.DataFrame, pd.Series]:
    """
    One sample per completed schedule row (real labels — no rules needed).
    Target: actual delay_days clamped to 0 minimum.
    """
    X_records: list[dict] = []
    y_records: list[float] = []

    for gauge in gauges:
        schedule_table = sorted(
            gauge.get("schedule_table", []),
            key=lambda r: int(r.get("schedule_id", 0)),
        )
        freq = int(gauge.get("frequency") or 12)

        for i, row in enumerate(schedule_table):
            if str(row.get("status", "")).strip().lower() != "completed":
                continue

            due_date  = _parse_date_safe(row.get("due_date"))
            comp_date = _parse_date_safe(row.get("completion_date"))
            if not due_date or not comp_date:
                continue

            actual_delay = max((comp_date - due_date).days, 0)
            history_rows = schedule_table[:i]
            if not history_rows:
                continue

            temp_gauge = {
                "schedule_table": history_rows,
                "frequency": freq,
                "due_date": row.get("due_date"),
            }
            feat   = extract_risk_features(temp_gauge, today=due_date)
            x_dict = {col: getattr(feat, col) for col in OVERRUN_FEATURE_COLS}
            X_records.append(x_dict)
            y_records.append(float(actual_delay))

    return (
        pd.DataFrame(X_records, columns=OVERRUN_FEATURE_COLS),
        pd.Series(y_records),
    )


def train_overrun_model(gauges: list[dict]) -> None:
    """
    Train Ridge Regression to predict how many days a gauge will overrun.
    Trained on real delay_days from schedule history — no rule-generated labels.
    """
    print("\n-- OVERRUN MODEL (Ridge Regression) --------------------------")
    X, y = _build_overrun_training_data(gauges)

    if len(X) == 0:
        print("No completed schedule rows found. Skipping.")
        return

    print(f"Samples      : {len(X)}")
    print(f"Delay (days) : mean={y.mean():.1f}, max={y.max():.1f}, zeros={int((y == 0).sum())}")

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = Ridge(alpha=1.0)
    model.fit(X_scaled, y)

    y_pred = np.clip(model.predict(X_scaled), 0, None)
    print(f"Train MAE    : {mean_absolute_error(y, y_pred):.2f} days")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model,           OVERRUN_MODEL_PATH)
    joblib.dump(scaler,          OVERRUN_SCALER_PATH)
    joblib.dump(list(X.columns), OVERRUN_FEATURES_PATH)
    print(f"Overrun model -> {OVERRUN_MODEL_PATH}")


# ============================================================================
# SECTION 3 — RECOMMENDATION MODEL  (RandomForest)
# Classifies action: no_change / reschedule / increase_frequency
# predicted_overrun from Ridge is a key feature — makes ML go beyond the rules
# ============================================================================

def _rule_rec_label(f: dict) -> int:
    """
    Rule-based recommendation labeler — generates training labels for RandomForest.

    0 = no_change
    1 = reschedule         (shift due date to least-loaded batch within 1-3 days)
    2 = increase_frequency (extend calibration cycle e.g. 6 -> 12 months)

    Priority: increase_frequency > reschedule > no_change
    """
    freq_days         = _freq_days(f["frequency_months"])
    predicted_overrun = f["predicted_overrun"]
    prev_delay        = f["prev_batch_delay"]
    delay_ratio       = predicted_overrun / freq_days

    # Chronic: repeated overdue + low completion rate
    chronic = f["overdue_count"] >= 2 and f["completion_rate"] < 0.65

    # -- increase_frequency --------------------------------------------------
    # Structural problem: chronic pattern with significant predicted overrun
    if chronic and predicted_overrun > 10:
        return 2

    # High overdue count + consistently high avg delay
    if f["overdue_count"] >= 2 and f["avg_delay_days"] > 30:
        return 2

    # Overrun exceeds 25% of the calibration window
    if delay_ratio > 0.25 and f["overdue_count"] >= 1:
        return 2

    # -- reschedule ----------------------------------------------------------
    # Any non-zero previous delay without chronic pattern
    if prev_delay > 0 and not chronic:
        return 1

    # Predicted overrun exists but not a structural problem
    if predicted_overrun > 3 and not chronic:
        return 1

    # Single overdue event with moderate avg delay
    if f["overdue_count"] == 1 and f["avg_delay_days"] > 5:
        return 1

    # -- no_change -----------------------------------------------------------
    return 0


def _build_rec_training_data(
    gauges: list[dict],
    overrun_model,
    overrun_scaler,
) -> tuple[pd.DataFrame, pd.Series]:
    """
    One sample per gauge (current state).
    predicted_overrun from Ridge included as feature so RandomForest
    genuinely learns beyond the rule labels.
    """
    X_records: list[dict] = []
    y_records: list[int]  = []
    today = datetime.utcnow()

    for gauge in gauges:
        freq     = int(gauge.get("frequency") or 12)
        features = extract_risk_features(gauge, today=today)

        base_dict    = {col: getattr(features, col) for col in OVERRUN_FEATURE_COLS}
        X_over       = pd.DataFrame([base_dict])[OVERRUN_FEATURE_COLS]
        X_over_sc    = overrun_scaler.transform(X_over)
        pred_overrun = float(np.clip(overrun_model.predict(X_over_sc)[0], 0, None))

        prev_delay  = _get_prev_batch_delay(gauge)
        delay_ratio = pred_overrun / _freq_days(freq)

        x_dict = {
            "avg_delay_days":    features.avg_delay_days,
            "max_delay_days":    features.max_delay_days,
            "overdue_count":     features.overdue_count,
            "completion_rate":   features.completion_rate,
            "frequency_months":  features.frequency_months,
            "history_size":      features.history_size,
            "prev_batch_delay":  prev_delay,
            "predicted_overrun": pred_overrun,
            "delay_ratio":       delay_ratio,
        }
        X_records.append(x_dict)
        y_records.append(_rule_rec_label(x_dict))

    return pd.DataFrame(X_records, columns=REC_FEATURE_COLS), pd.Series(y_records)


def train_recommendation_model(gauges: list[dict]) -> None:
    """
    Train RandomForest recommendation classifier.
    Must run after train_overrun_model() — depends on overrun model files.
    """
    print("\n-- RECOMMENDATION MODEL (RandomForest) -----------------------")

    if not os.path.exists(OVERRUN_MODEL_PATH):
        print("Overrun model not found — skipping recommendation model.")
        return

    overrun_model  = joblib.load(OVERRUN_MODEL_PATH)
    overrun_scaler = joblib.load(OVERRUN_SCALER_PATH)

    X, y = _build_rec_training_data(gauges, overrun_model, overrun_scaler)
    if len(X) == 0:
        print("No data. Skipping.")
        return

    print(f"Samples: {len(X)}")
    for k, v in sorted(Counter(y).items()):
        print(f"  {REC_LABEL_MAP[k]}: {v}")

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=6,
        min_samples_leaf=8,
        class_weight="balanced",
        random_state=42,
    )

    min_class_count = min(Counter(y).values())
    n_splits = min(5, min_class_count)
    if n_splits >= 2:
        cv     = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        scores = cross_val_score(model, X_scaled, y, cv=cv, scoring="f1_macro")
        print(f"CV F1 (macro): {scores.mean():.3f} ± {scores.std():.3f}")
    else:
        print("Too few samples in one class for CV — skipping cross-validation.")

    model.fit(X_scaled, y)
    y_pred = model.predict(X_scaled)
    print(classification_report(
        y,
        y_pred,
        labels=[0, 1, 2],
        target_names=["no_change", "reschedule", "increase_frequency"],
        zero_division=0,
    ))

    importances = pd.Series(model.feature_importances_, index=REC_FEATURE_COLS)
    print("\nFeature importances:")
    print(importances.sort_values(ascending=False).to_string())

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model,  REC_MODEL_PATH)
    joblib.dump(scaler, REC_SCALER_PATH)
    joblib.dump(
        {"label_map": REC_LABEL_MAP, "feature_cols": REC_FEATURE_COLS},
        REC_METADATA_PATH,
    )
    print(f"Recommendation model -> {REC_MODEL_PATH}")


# ============================================================================
# ENTRY POINT
# train_model() is the original entry point — now trains all three models
# ============================================================================

def train_model() -> None:
    # Risk model fetches gauges internally (preserving original behaviour)
    train_risk_model()

    # Overrun + recommendation share a single DB fetch
    print("\nLoading gauges for overrun + recommendation training...")
    db     = get_db()
    gauges = list(db.gauges.find({}))
    print(f"Loaded {len(gauges)} gauges.")

    train_overrun_model(gauges)
    train_recommendation_model(gauges)

    close_connection()
    print("\nAll models trained and saved.")


if __name__ == "__main__":
    train_model()

# Run: python -m app.ml.trainer