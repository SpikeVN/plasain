"""Dual-engine physiological weight model.

Engine 1 follows the ridge-filter approach described in MODEL.md. Engine 2
uses Mifflin-St Jeor equilibrium and a decaying Hall-style trajectory.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import root_scalar
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


class Engine1TrueTrend(BaseEstimator, RegressorMixin):
    def __init__(self, alpha: float = 1.0):
        self.alpha = alpha
        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("model", Ridge(alpha=alpha, fit_intercept=True)),
        ])

    def fit(self, X: pd.DataFrame, y: pd.Series):
        self.pipeline.fit(X, y)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict(X)


class Engine2FutureFit:
    def __init__(self, height_cm: float, age_years: int, sex: str, pal: float):
        self.height_cm, self.age_years, self.sex, self.pal = height_cm, age_years, sex, pal
        self.sex_constant = 5.0 if sex == "male" else -161.0

    def calculate_bmr(self, weight_kg: float) -> float:
        return 9.99 * weight_kg + 6.25 * self.height_cm - 4.92 * self.age_years + self.sex_constant

    def calculate_tdee(self, weight_kg: float) -> float:
        return self.calculate_bmr(weight_kg) * self.pal

    def solve_w_floor(self, target_calories: float) -> float:
        objective = lambda weight: self.calculate_tdee(weight) - target_calories
        try:
            result = root_scalar(objective, bracket=[30.0, 250.0], method="brentq")
            if result.converged:
                return result.root
        except ValueError:
            pass
        return ((target_calories / self.pal) - 6.25 * self.height_cm + 4.92 * self.age_years - self.sex_constant) / 9.99

    def project_trajectory(self, w0_kg: float, target_calories: float, days: int = 90) -> list[dict[str, float | int]]:
        floor = self.solve_w_floor(target_calories)
        deficit = self.calculate_tdee(w0_kg) - target_calories
        k = max(0.0, deficit / 7700.0 * 0.0175) if deficit > 0 else 0.0
        return [
            {"day": day, "projected_weight_kg": round(float(floor + (w0_kg - floor) * np.exp(-k * day)), 2), "metabolic_floor_kg": round(float(floor), 2)}
            for day in range(days + 1)
        ]


def analyse_check_ins(check_ins: list[dict[str, float]], height_cm: float, age_years: int, sex: str, pal: float, target_calories: float) -> dict[str, object]:
    logs = pd.DataFrame(check_ins)
    engine2 = Engine2FutureFit(height_cm, age_years, sex, pal)
    logs["tdee"] = logs["weight_kg"].map(engine2.calculate_tdee)
    logs["delta_E"] = logs["calories"] - logs["tdee"]
    logs["delta_C"] = logs["carbs_g"] - logs["carbs_g"].rolling(7, min_periods=1).mean()
    logs["delta_Na"] = logs["sodium_mg"] - logs["sodium_mg"].rolling(7, min_periods=1).mean()

    # A 7-day delta needs at least eight logs. With less history, the seven-day
    # rolling mean is an intentionally conservative clean-baseline fallback.
    if len(logs) >= 8:
        training = logs.iloc[7:].copy()
        training["weight_delta"] = logs["weight_kg"].iloc[7:].to_numpy() - logs["weight_kg"].iloc[:-7].to_numpy()
        features = ["delta_E", "protein_g", "delta_C", "delta_Na"]
        model = Engine1TrueTrend().fit(training[features], training["weight_delta"])
        predicted_delta = float(model.predict(logs.iloc[[-1]][features])[0])
        clean_baseline = float(logs["weight_kg"].iloc[-8] + predicted_delta)
        method = "ridge-filtered 7-day trend"
    else:
        clean_baseline = float(logs["weight_kg"].tail(7).mean())
        method = "7-day average (add an eighth check-in to calibrate the ridge filter)"

    trajectory = engine2.project_trajectory(clean_baseline, target_calories)
    tdee = engine2.calculate_tdee(clean_baseline)
    return {
        "clean_baseline_kg": round(clean_baseline, 2),
        "current_weight_kg": round(float(logs["weight_kg"].iloc[-1]), 2),
        "tdee": round(tdee),
        "caloric_deficit": round(tdee - target_calories),
        "initial_weekly_rate_kg": round((tdee - target_calories) * 7 / 7700, 2),
        "metabolic_floor_kg": trajectory[0]["metabolic_floor_kg"],
        "trajectory": trajectory,
        "trend_method": method,
    }
