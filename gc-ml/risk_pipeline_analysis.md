# How Risk Is Calculated — Full Pipeline Explanation

## Overview

Risk is calculated in **4 steps**: Extract Features → Score with ML model → Classify level → Aggregate to batch.

---

## Step 1: Feature Extraction (`feature_engineering.py`)

For each gauge, the system reads the `schedule_table` (calibration history) and computes:

| Feature | What It Means |
|---|---|
| `days_until_due` | How many days until the next calibration is due (negative = already overdue) |
| `is_overdue` | `1` if the current active schedule is past its due date, else `0` |
| `overdue_count` | Number of past calibrations that were completed late |
| `completion_rate` | % of schedule rows that have been completed (e.g. 0.75 = 75%) |
| `avg_delay_days` | Average number of days past the due date for late completions |
| `max_delay_days` | Worst single delay ever recorded for this gauge |
| `history_size` | Total number of completed + overdue rows (data confidence indicator) |
| `frequency_months` | How often the gauge should be calibrated (e.g. 6 = every 6 months) |

---

## Step 2: ML Scoring (`scorer.py`)

The **Gradient Boosting Classifier** takes those 8 features and outputs a **probability (0–100)** of the gauge being late for its next calibration.

> Think of it as: *"Based on this gauge's history, there's a X% chance it will miss its next calibration deadline."*

The model was **trained** on historical schedule rows where:
- **Label = 1 (late)**: The row was completed after the due date, OR had status "overdue"
- **Label = 0 (on-time)**: Everything else

---

## Step 3: Risk Level Classification (`config.py`)

The raw probability score (0–100) is converted to a level:

```
score >= 20.22  → HIGH
score >= 6.13   → MEDIUM
score < 6.13    → LOW
```

> [!CAUTION]
> **These thresholds (20.22, 6.13) are ARBITRARY** — they were manually set and were never derived from the actual data distribution. This is likely a major source of inaccuracy.

---

## Step 4: Batch Risk Aggregation (`repositories/`)

Once all gauges in a batch are scored, the batch gets a single risk number:

```
batch_risk = (high_count × 1.0 + medium_count × 0.5 + low_count × 0.0) / total_gauges
```

---

## Known Issues & Root Causes of Inaccuracy

### 🔴 Issue 1: Arbitrary Thresholds (Biggest Problem)
The cutoffs `HIGH=20.22` and `MEDIUM=6.13` were never calibrated against the actual score distribution after training. After the recent class-balance fix, scores will be distributed differently. **These need to be auto-calculated after each training run.**

### 🔴 Issue 2: Training Data Quality
- Only **13.4% of training rows were "late"** — this reflects real-world data where most gauges are calibrated on time
- Gauges with no history (no completed rows) get a score of `0.0` by default — they appear "Low Risk" even though they're unknown

### 🟡 Issue 3: `is_overdue` is a Binary Signal, Not Gradual
A gauge 1 day overdue looks the same as one 300 days overdue. The `days_until_due` feature partially compensates, but the model doesn't directly see "how overdue".

### 🟡 Issue 4: No Time-Decay
A gauge that was consistently late 5 years ago but perfect for the last 2 years is treated the same as one that just started being late.

---

## Recommended Fix: Auto-Calculate Thresholds After Training

Instead of hardcoded values, calculate thresholds from the actual score distribution so that:
- ~15% of gauges are High Risk
- ~25% are Medium Risk  
- ~60% are Low Risk

(These percentages can be adjusted to match business expectations.)
