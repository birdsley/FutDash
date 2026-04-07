#!/usr/bin/env python3
"""
FutDash Phase 3 — Model Training
==================================
Trains a LightGBM 3-class classifier (H=2 / D=1 / A=0) on the
feature CSV(s) produced by feature_engineering.py.

Time-split strategy:
    Train  : Date < 2023-01-01  (all seasons up to 2022/23)
    Validate: 2023-01-01 ≤ Date < 2025-01-01  (seasons 2023/24, 2024/25)

Outputs:
    scripts/model.joblib        – serialised LightGBM + metadata
    scripts/model_report.txt    – accuracy, Brier score, confusion matrix
"""

import os
import sys
import argparse
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
import joblib

# Optional: LightGBM (gracefully falls back to GradientBoosting)
try:
    import lightgbm as lgb
    LGBM_AVAILABLE = True
except ImportError:
    LGBM_AVAILABLE = False
    from sklearn.ensemble import GradientBoostingClassifier
    print("  ⚠️  lightgbm not found — falling back to sklearn GradientBoostingClassifier")

from sklearn.metrics import (
    accuracy_score, confusion_matrix, classification_report, brier_score_loss
)
from sklearn.preprocessing import label_binarize

warnings.filterwarnings("ignore")

# ── Model feature columns ─────────────────────────────────────────
# Must match FINAL_FEATURES in feature_engineering.py
MODEL_FEATURES = [
    # ELO (from xgabora embedded or EloRatings.csv)
    "elo_home",
    "elo_away",
    "elo_diff",
    "elo_advantage",
    # Rolling form (computed by feature_engineering.py)
    "home_goals_scored_5",
    "home_goals_conceded_5",
    "home_win_pct_5",
    "home_form_streak",
    "away_goals_scored_5",
    "away_goals_conceded_5",
    "away_win_pct_5",
    "away_form_streak",
    "home_shots_pg_5",
    "home_sot_pg_5",
    "away_shots_pg_5",
    "away_sot_pg_5",
    # xgabora built-in form points
    "Form3Home",
    "Form5Home",
    "Form3Away",
    "Form5Away",
    "form3_diff",
    "form5_diff",
    "form_momentum_home",
    "form_momentum_away",
    # Head-to-head
    "h2h_win_rate",
    # Context
    "is_home",
    "home_days_rest",
    "away_days_rest",
    "league_position_diff",
    # Bookmaker implied probabilities (normalised — no margin leakage)
    "b365_implied_home",
    "b365_implied_draw",
    "b365_implied_away",
    "b365_margin",
    "max_implied_home",
    "max_implied_draw",
    "max_implied_away",
    "max_margin",
    # xgabora cluster features
    "C_LTH",
    "C_LTA",
    "C_VHD",
    "C_VAD",
    "C_HTB",
    "C_PHB",
]

TARGET = "outcome"   # 2=H, 1=D, 0=A
CLASSES = [0, 1, 2]  # A, D, H
CLASS_NAMES = {0: "away_win", 1: "draw", 2: "home_win"}

TRAIN_CUTOFF    = pd.Timestamp("2023-01-01")
VALIDATE_CUTOFF = pd.Timestamp("2025-01-01")


# ── Training ──────────────────────────────────────────────────────

def load_features(features_path: str) -> pd.DataFrame:
    print(f"  Loading features from: {features_path}")
    df = pd.read_csv(features_path, low_memory=False)
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", TARGET]).copy()
    df[TARGET] = df[TARGET].astype(int)
    print(f"  Total matches: {len(df):,}")
    return df


def split_data(df: pd.DataFrame):
    train_mask = df["Date"] < TRAIN_CUTOFF
    val_mask   = (df["Date"] >= TRAIN_CUTOFF) & (df["Date"] < VALIDATE_CUTOFF)
    train = df[train_mask].copy()
    val   = df[val_mask].copy()
    print(f"  Train set: {len(train):,} matches (pre-{TRAIN_CUTOFF.date()})")
    print(f"  Val   set: {len(val):,}   matches ({TRAIN_CUTOFF.date()} – {VALIDATE_CUTOFF.date()})")
    return train, val


def get_X_y(df: pd.DataFrame, features: list):
    available = [c for c in features if c in df.columns]
    missing   = [c for c in features if c not in df.columns]
    if missing:
        print(f"  ⚠️  Missing feature columns (filled with 0): {missing}")
    X = df[available].copy()
    for col in missing:
        X[col] = 0.0
    # Reorder to match full feature list
    X = X.reindex(columns=features, fill_value=0.0)
    # Impute remaining NaNs with column medians
    for col in X.columns:
        med = X[col].median()
        X[col] = X[col].fillna(med if not np.isnan(med) else 0.0)
    y = df[TARGET].values
    return X, y


def build_model():
    if LGBM_AVAILABLE:
        model = lgb.LGBMClassifier(
            n_estimators=400,
            learning_rate=0.05,
            num_leaves=31,
            max_depth=6,
            min_child_samples=20,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=0.1,
            objective="multiclass",
            num_class=3,
            class_weight="balanced",
            random_state=42,
            verbose=-1,
        )
        model_name = "LightGBM"
    else:
        # sklearn MultiOutputClassifier workaround for 3-class
        from sklearn.ensemble import GradientBoostingClassifier
        model = GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            random_state=42,
        )
        model_name = "sklearn GradientBoosting"
    return model, model_name


def multiclass_brier(y_true, y_prob, classes=CLASSES):
    """Mean Brier score over all classes."""
    y_bin = label_binarize(y_true, classes=classes)
    scores = []
    for i in range(len(classes)):
        scores.append(brier_score_loss(y_bin[:, i], y_prob[:, i]))
    return float(np.mean(scores))


def train(features_path: str, output_dir: str, verbose: bool = True):
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  FutDash Phase 3 — Model Training")
    print(f"{'='*60}")

    df = load_features(features_path)
    train_df, val_df = split_data(df)

    # Use only features actually present; fill missing with 0
    used_features = MODEL_FEATURES  # train_model always uses the full list

    X_train, y_train = get_X_y(train_df, used_features)
    X_val,   y_val   = get_X_y(val_df,   used_features)

    # Drop columns that are all-zero or all-NaN (unhelpful)
    non_trivial = [c for c in X_train.columns
                   if X_train[c].std() > 0 and X_train[c].notna().any()]
    if len(non_trivial) < len(used_features):
        print(f"  Dropping {len(used_features)-len(non_trivial)} trivial features")
        used_features = non_trivial
        X_train = X_train[used_features]
        X_val   = X_val[used_features]

    model, model_name = build_model()
    print(f"\n  Model: {model_name}")
    print(f"  Training on {len(X_train):,} samples × {len(used_features)} features ...")

    if LGBM_AVAILABLE:
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(50, verbose=False),
                       lgb.log_evaluation(period=-1)],
        )
    else:
        model.fit(X_train, y_train)

    # ── Evaluate ──────────────────────────────────────────────────
    y_pred  = model.predict(X_val)
    y_prob  = model.predict_proba(X_val)   # shape (n, 3)

    acc    = accuracy_score(y_val, y_pred)
    brier  = multiclass_brier(y_val, y_prob)
    cm     = confusion_matrix(y_val, y_pred, labels=CLASSES)
    report = classification_report(y_val, y_pred,
                                   labels=CLASSES,
                                   target_names=["Away Win", "Draw", "Home Win"])

    print(f"\n  ── Validation Results ──────────────────────────────")
    print(f"  Accuracy  : {acc:.4f}  ({acc*100:.1f}%)")
    print(f"  Brier Score (mean): {brier:.4f}")
    print(f"\n  Classification Report:\n{report}")
    print(f"  Confusion Matrix (rows=actual, cols=predicted):")
    print(f"  Labels: [Away=0, Draw=1, Home=2]")
    print(f"  {cm}")

    # Baseline: always predict Home Win (most common outcome)
    baseline_acc = accuracy_score(y_val, np.full(len(y_val), 2))
    print(f"\n  Baseline (always Home): {baseline_acc:.4f}")
    print(f"  Model improvement: +{(acc - baseline_acc)*100:.1f} pp")

    # ── Feature importance ────────────────────────────────────────
    fi = {}
    if LGBM_AVAILABLE:
        fi = dict(zip(used_features, model.feature_importances_.tolist()))
        fi_sorted = sorted(fi.items(), key=lambda x: -x[1])
        print(f"\n  Top-10 Feature Importances:")
        max_fi = max(fi.values()) if fi else 1
        for feat, imp in fi_sorted[:10]:
            bar = "█" * int(imp / max_fi * 20)
            print(f"  {feat:<40} {bar} {imp:.0f}")

    # ── Save model bundle ─────────────────────────────────────────
    model_path = os.path.join(output_dir, "model.joblib")
    bundle = {
        "model":          model,
        "model_name":     model_name,
        "features":       used_features,
        "classes":        CLASSES,
        "class_names":    CLASS_NAMES,
        "train_cutoff":   TRAIN_CUTOFF.isoformat(),
        "val_cutoff":     VALIDATE_CUTOFF.isoformat(),
        "val_accuracy":   acc,
        "val_brier":      brier,
        "feature_importance": fi,
        "trained_at":     datetime.utcnow().isoformat() + "Z",
    }
    joblib.dump(bundle, model_path)
    print(f"\n  ✅ Model bundle saved → {model_path}")

    # ── Save text report ─────────────────────────────────────────
    report_path = os.path.join(output_dir, "model_report.txt")
    with open(report_path, "w") as f:
        f.write(f"FutDash Phase 3 — Model Training Report\n")
        f.write(f"Generated: {datetime.utcnow().isoformat()}Z\n\n")
        f.write(f"Model         : {model_name}\n")
        f.write(f"Train cutoff  : pre-{TRAIN_CUTOFF.date()}\n")
        f.write(f"Val range     : {TRAIN_CUTOFF.date()} – {VALIDATE_CUTOFF.date()}\n")
        f.write(f"Train samples : {len(X_train):,}\n")
        f.write(f"Val samples   : {len(X_val):,}\n\n")
        f.write(f"Accuracy      : {acc:.4f} ({acc*100:.1f}%)\n")
        f.write(f"Brier Score   : {brier:.4f}\n")
        f.write(f"Baseline      : {baseline_acc:.4f}\n")
        f.write(f"Improvement   : +{(acc-baseline_acc)*100:.1f} pp\n\n")
        f.write(f"Features used ({len(used_features)}):\n")
        for feat in used_features:
            imp_str = f"  importance={fi[feat]:.0f}" if feat in fi else ""
            f.write(f"  - {feat}{imp_str}\n")
        f.write(f"\n{report}\n")
        f.write(f"\nConfusion Matrix (rows=actual, cols=predicted):\n")
        f.write(f"Labels: [Away=0, Draw=1, Home=2]\n")
        f.write(f"{cm}\n")

    print(f"  ✅ Report saved → {report_path}")
    print(f"\n{'='*60}\n")

    return bundle


# ── CLI ──────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="FutDash Phase 3 — Train LightGBM Match Outcome Predictor")
    p.add_argument("--features",   default="./scripts/features/features_all.csv",
                   help="Path to combined features CSV from feature_engineering.py")
    p.add_argument("--output-dir", default="./scripts",
                   help="Directory for model.joblib + model_report.txt")
    p.add_argument("--quiet",      action="store_true")
    args = p.parse_args()

    if not os.path.exists(args.features):
        print(f"[ERROR] Features file not found: {args.features}")
        print("  Run feature_engineering.py first.")
        sys.exit(1)

    train(args.features, args.output_dir, verbose=not args.quiet)


if __name__ == "__main__":
    main()
