from __future__ import annotations

import os
import joblib
import numpy as np
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report

from app.db.mongo_client import get_db, close_connection
from app.ml.feature_engineering import extract_risk_features
from app.core.config import MODEL_PATH, MODEL_DIR, FEATURES_PATH, METADATA_PATH
from app.core.date_utils import parse_date
from datetime import datetime

# ---------------------------------------------------------------------------
# Rule-based labeler  (generates training labels — no manual annotation needed)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Build training dataset
# ---------------------------------------------------------------------------

def build_training_data() -> tuple[pd.DataFrame, pd.Series]:
    db = get_db()
    gauges = list(db.gauges.find({}))

    X_records: list[dict] = []
    y_records: list[int] = []

    for gauge in gauges:
        schedule_table = gauge.get("schedule_table", [])
        schedule_table = sorted(
            schedule_table, key=lambda r: int(r.get("schedule_id", 0))
        )

        # ── One sample per gauge (current state) ──────────────────────────
        # Using the full gauge as-is gives one high-quality sample per gauge
        # rather than fragmented partial-history slices on thin data.
        today = datetime.utcnow()
        features = extract_risk_features(gauge, today=today)

        x_dict = {col: getattr(features, col) for col in FEATURE_COLS}
        label = _rule_label(x_dict)

        X_records.append(x_dict)
        y_records.append(label)

        # ── Additional chronological samples (only for gauges with 4+ rows) ─
        # Gives the model historical snapshots without generating noise on
        # gauges that have only 2–3 schedule entries.
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


# ---------------------------------------------------------------------------
# Train
# ---------------------------------------------------------------------------

def train_model() -> None:
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

    # ── Scale features ───────────────────────────────────────────────────
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # ── Logistic Regression (multinomial, 3 classes) ─────────────────────
    model = LogisticRegression(
        # multi_class="multinomial",
        solver="lbfgs",
        max_iter=1000,
        C=1.0,                  # L2 regularisation — prevents overfitting on small data
        class_weight="balanced", # handles class imbalance automatically
        random_state=42,
    )

    # ── Cross-validation ─────────────────────────────────────────────────
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(model, X_scaled, y, cv=cv, scoring="f1_macro")
    print(f"\nCross-val F1 (macro): {scores.mean():.3f} ± {scores.std():.3f}")

    # ── Final fit ────────────────────────────────────────────────────────
    model.fit(X_scaled, y)
    y_pred = model.predict(X_scaled)
    print("\nTraining classification report:")
    print(classification_report(y, y_pred, target_names=["LOW", "MEDIUM", "HIGH"]))

    # ── Derive score thresholds from HIGH-class probability distribution ─
    # Use the P(HIGH) column to set cutoffs at the 60th and 30th percentile,
    # ensuring roughly 40% HIGH, 30% MEDIUM, 30% LOW on current data.
    high_class_idx = list(model.classes_).index(2)
    proba_high = model.predict_proba(X_scaled)[:, high_class_idx] * 100.0
    HIGH_CUTOFF   = float(np.percentile(proba_high, 60))
    MEDIUM_CUTOFF = float(np.percentile(proba_high, 30))
    print(f"\nAuto-calibrated thresholds → HIGH >= {HIGH_CUTOFF:.1f}, MEDIUM >= {MEDIUM_CUTOFF:.1f}")

    # ── Save artifacts ───────────────────────────────────────────────────
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model,             MODEL_PATH)
    joblib.dump(list(X.columns),   FEATURES_PATH)
    joblib.dump(scaler,            os.path.join(MODEL_DIR, "scaler.pkl"))
    joblib.dump(
        {"HIGH_RISK_CUTOFF": HIGH_CUTOFF, "MEDIUM_RISK_CUTOFF": MEDIUM_CUTOFF},
        METADATA_PATH,
    )

    print(f"\nModel  → {MODEL_PATH}")
    print(f"Scaler → {os.path.join(MODEL_DIR, 'scaler.pkl')}")
    close_connection()


if __name__ == "__main__":
    train_model()

# Run: python -m app.ml.trainer