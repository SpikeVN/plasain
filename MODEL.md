# Dual-Engine Physiological Weight-Tracking System Specification

This document provides a comprehensive technical specification for implementing the **Dual-Engine Health System** in a production environment (Python backend + web app UI). It details the mathematical formulation, architecture, explicit choices made, and integration points for backend developers and web application engineers.

---

## 1. System Architectural Overview

The platform uses a **hybrid ML and dynamic simulation approach** to separate physiological noise from true tissue change and project long-term weight trajectories without relying on simplistic linear rules.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER INPUTS                                │
│   Scale Weight, Food Log (Kcal, P, C, Na), Demographics (Sex, Age, H)   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ENGINE 1: TRUE TREND (ML)                         │
│  • Retrospective Filter: Ridge Regression (L2 Penalty)                  │
│  • Features: ΔE (Deficit), P (Protein), ΔC (Carb dev), ΔNa (Salt dev)   │
│  • Output: W0 (Clean 7-Day Baseline Weight Vector)                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Passes W0 & Calibrated Efficiency
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ENGINE 2: FUTURE FIT (SIMULATOR)                   │
│  • Dynamic Solver: Mifflin-St Jeor via scipy.optimize.root_scalar       │
│  • Non-Linear Exponential Decay Model: Weight(t)                        │
│  • Output: Metabolic Floor Target (W_floor) & 90-Day Trajectory Curve   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             WEB APP / UI                                │
│  • Interactive Target Calories Slider bounded by physical constraints   │
│  • Dynamic Chart: Scaled Trend vs. Projected Plateau                    │
└─────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Engine 1: True Trend (Retrospective ML Noise Filter)

### 2.1 Purpose & Problem Statement

Daily scale weight fluctuates wildly due to fluid shifts driven by glycogen storage and sodium balance. Engine 1 isolates true fat and muscle tissue changes from short-term water bloat.

### 2.2 Mathematical Model

Engine 1 uses **Ridge Regression ($\mathcal{L}\_2$ Regularized Linear Model)** trained on a rolling window of user daily logs:

$$\Delta W_{7\text{d}} = \beta_0 + \beta_E (\Delta E) + \beta_P (P) + \beta_C (\Delta C) + \beta_{Na} (\Delta Na) + \varepsilon$$

$$\min_{\boldsymbol{\beta}} \sum_{t=1}^{N} \left( \Delta W_{7\text{d}, t} - \boldsymbol{X}_t \boldsymbol{\beta} \right)^2 + \alpha \Vert{}\boldsymbol{\beta}\Vert{}_2^2$$

### 2.3 Variables & Measurement Units

| Feature                | Description              | Measurement / Calculation                                        | Units                        |
| ---------------------- | ------------------------ | ---------------------------------------------------------------- | ---------------------------- |
| $\Delta W_{7\text{d}}$ | 7-Day Scale Delta        | $\text{Weight}_t - \text{Weight}_{t-7}$                          | Kilograms ($\text{kg}$)      |
| $\Delta E$             | Net Daily Energy Balance | $\text{Logged Calories} - \text{TDEE}$                           | Kilocalories ($\text{kcal}$) |
| $P$                    | Daily Protein Intake     | Total daily logged protein                                       | Grams ($\text{g}$)           |
| $\Delta C$             | Carbohydrate Deviation   | $\text{Carb}_{\text{today}} - \text{Carb}_{7\text{d\_mean}}$     | Grams ($\text{g}$)           |
| $\Delta Na$            | Sodium Deviation         | $\text{Sodium}_{\text{today}} - \text{Sodium}_{7\text{d\_mean}}$ | Milligrams ($\text{mg}$)     |

- **7-Day Historical Means:**

$$\text{Carb}_{7\text{d\_mean}} = \frac{1}{7} \sum_{i=0}^{6} \text{Carb}_{t-i}, \quad \text{Sodium}_{7\text{d\_mean}} = \frac{1}{7} \sum_{i=0}^{6} \text{Sodium}_{t-i}$$

### 2.4 Why These Choices Were Made

- **Ridge Penalty ($\alpha$ Regularization):** Solves severe multicollinearity (e.g., high-sodium foods are frequently high-carb). Ridge prevents coefficient explosion and keeps weights physically realistic.
- **Deviation Metrics ($\Delta C, \Delta Na$):** Carbohydrates bind $3\text{--}4\text{ g}$ of water per gram of glycogen ($Olsson \& Saltin, 1970$), and sodium alters extracellular fluid volume ($He \& MacGregor, 2001$). Modeling _deviations from baseline_ isolates acute fluid spikes from sustained diet trends.
- **Absolute Protein ($P$):** Absolute protein captures the high Thermic Effect of Food ($\text{TEF} \approx 20\text{--}30\%$) and lean tissue sparing.

---

## 3. Engine 2: Future Fit (Dynamic Metabolic Simulator)

### 3.1 Purpose & Problem Statement

Traditional calculators use the static $3,500\text{ kcal/lb}$ ($7,700\text{ kcal/kg}$) rule ($Wishnofsky, 1958$), projecting infinite linear weight loss. Engine 2 models real biological weight plateaus using non-linear exponential decay ($Hall et al., 2011$).

### 3.2 Dynamic Weight Equation

$$\text{Weight}(t) = W_{\text{floor}} + \left( W_0 - W_{\text{floor}} \right) e^{-kt}$$

Where:

- **$W_0$ (Starting Weight):** The cleaned baseline weight vector from Engine 1 ($\text{kg}$).
- **$W\_{\text{floor}}$ (Metabolic Floor Target):** The weight at which daily caloric expenditure equals target caloric intake ($\text{kg}$).
- **$k$ (Decay Rate Constant):** Velocity parametergoverning weight loss speed ($\text{day}^{-1}$).
- **$t$:** Time index in days ($0, 1, 2, \dots, N$).

### 3.3 Solving for the Metabolic Floor ($W_{\text{floor}}$)

$W_{\text{floor}}$ is the weight where $\text{TDEE}(W) = \text{Target Calories}$.

#### Mifflin-St Jeor Formula

$$\text{BMR}(W) = 9.99(W) + 6.25(H) - 4.92(A) + s$$

$$\text{where } s = \begin{cases} +5 & \text{male} \\ -161 & \text{female} \end{cases}$$

$$\text{TDEE}(W) = \text{BMR}(W) \times \text{PAL}$$

#### Closed-Form Metric Solution

$$\text{Male: } W_{\text{floor}} = \frac{\frac{\text{Target Calories}}{\text{PAL}} - 6.25H + 4.92A - 5}{9.99}$$

$$\text{Female: } W_{\text{floor}} = \frac{\frac{\text{Target Calories}}{\text{PAL}} - 6.25H + 4.92A + 161}{9.99}$$

_(Note: For non-linear activity factors or complex equations like Katch-McArdle, the system falls back to `scipy.optimize.root_scalar` to solve $\text{TDEE}(W) - \text{Target Calories} = 0$.)_

### 3.4 Metric Decay Velocity Constant ($k$)

$$k = \left( \frac{\text{TDEE}(W_0) - \text{Target Calories}}{7700} \right) \cdot \lambda$$

- **$7700\text{ kcal/kg}$:** The metric energy equivalent for $1\text{ kg}$ of human tissue.
- **$\lambda$ (Adaptation Factor):** Default set to $0.0175\text{ day}^{-1}$, reflecting metabolic slowdown observed in clinical trials ($Thomas et al., 2013$).

---

## 4. Academic & Scientific Citation Index

When referencing the scientific basis in backend comments or application documentation, use the following citations:

1. **Non-Linear Metabolic Adaptation & Plateaus:**
   Hall, K. D., et al. (2011). Quantification of the effect of energy imbalance on bodyweight. _The Lancet_, 378(9793), 826–837. `[https://doi.org/10.1016/S0140-6736(11)60812-X](https://doi.org/10.1016/S0140-6736(11)60812-X)`
2. **Validation of Dynamic Loss Curves:**
   Thomas, D. M., et al. (2013). Can weight loss models accurately predict weight loss in weight loss trials? _The American Journal of Clinical Nutrition_, 97(5), 951–959. `[https://doi.org/10.3945/ajcn.112.046839](https://doi.org/10.3945/ajcn.112.046839)`
3. **Metabolic Rate Formula (Mifflin-St Jeor):**
   Mifflin, M. D., et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. _The American Journal of Clinical Nutrition_, 51(2), 241–247. `[https://doi.org/10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241)`
4. **Physical Activity Levels (PAL):**
   Food and Agriculture Organization, World Health Organization, & United Nations University. (2004). _Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation_ (FAO Food and Nutrition Technical Report Series, No. 1). FAO.
5. **Glycogen Fluid Binding ($\Delta C$):**
   Olsson, K. E., & Saltin, B. (1970). Variation in total body water with muscle glycogen changes in man. _Acta Physiologica Scandinavica_, 80(1), 11–18. `[https://doi.org/10.1111/j.1748-1716.1970.tb04764.x](https://doi.org/10.1111/j.1748-1716.1970.tb04764.x)`
6. **Sodium Osmotic Shifts ($\Delta Na$):**
   He, F. J., & MacGregor, G. A. (2001). Effect of modest salt reduction on blood pressure... and extracellular fluid. _Journal of Human Hypertension_, 15(11), 763–770. `[https://doi.org/10.1038/sj.jhh.1001268](https://doi.org/10.1038/sj.jhh.1001268)`
7. **Historical $3,500\text{ kcal}$ Rule ($7,700\text{ kcal/kg}$):**
   Wishnofsky, M. (1958). Caloric equivalents of gained or lost weight. _The American Journal of Clinical Nutrition_, 6(5), 542–546. `[https://doi.org/10.1093/ajcn/6.5.542](https://doi.org/10.1093/ajcn/6.5.542)`

---

## 5. Backend Implementation Specifications

### 5.1 Technology Stack Requirements

- **Python:** $\ge 3.10$
- **Core Libraries:** `scikit-learn` (Pipeline, Ridge, StandardScaler), `scipy` (optimize.root_scalar), `numpy`, `pandas`

### 5.2 Scikit-Learn Class Architecture

Engine 1 is wrapped as a scikit-learn compatible estimator inheriting from `BaseEstimator` and `RegressorMixin`:

```python
import numpy as np
import pandas as pd
from scipy.optimize import root_scalar
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


class Engine1TrueTrend(BaseEstimator, RegressorMixin):
    """
    Engine 1: Ridge regression noise filter to isolate fat mass from water retention.
    Features: [delta_E, P, delta_C, delta_Na]
    Target: 7-day weight change (kg)
    """
    def __init__(self, alpha: float = 1.0):
        self.alpha = alpha
        self.pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('model', Ridge(alpha=self.alpha, fit_intercept=True))
        ])

    def fit(self, X: pd.DataFrame, y: pd.Series):
        # Expects columns: ['delta_E', 'P', 'delta_C', 'delta_Na']
        self.pipeline.fit(X, y)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict(X)


class Engine2FutureFit:
    """
    Engine 2: Dynamic weight projection simulator using Mifflin-St Jeor root solving.
    """
    def __init__(self, height_cm: float, age_years: int, sex: str, pal: float):
        self.H = height_cm
        self.A = age_years
        self.sex = sex.lower()
        self.pal = pal
        self.s = 5.0 if self.sex == 'male' else -161.0

    def calculate_bmr(self, weight_kg: float) -> float:
        return (9.99 * weight_kg) + (6.25 * self.H) - (4.92 * self.A) + self.s

    def calculate_tdee(self, weight_kg: float) -> float:
        return self.calculate_bmr(weight_kg) * self.pal

    def solve_w_floor(self, target_calories: float) -> float:
        """Solves TDEE(W) - Target_Calories = 0 via root_scalar"""
        objective = lambda W: self.calculate_tdee(W) - target_calories

        # Search boundary between 30kg and 250kg
        res = root_scalar(objective, bracket=[30.0, 250.0], method='brentq')
        if res.converged:
            return res.root
        # Closed-form fallback if root finder fails
        return ((target_calories / self.pal) - (6.25 * self.H) + (4.92 * self.A) - self.s) / 9.99

    def project_trajectory(
        self,
        w0_kg: float,
        target_calories: float,
        days: int = 90,
        lambda_decay: float = 0.0175
    ) -> pd.DataFrame:
        w_floor = self.solve_w_floor(target_calories)
        tdee_w0 = self.calculate_tdee(w0_kg)
        initial_deficit = tdee_w0 - target_calories

        # Metric rate constant calculation (7700 kcal / kg)
        k = max(0.0, (initial_deficit / 7700.0) * lambda_decay) if initial_deficit > 0 else 0.0

        t_vec = np.arange(0, days + 1)
        w_t = w_floor + (w0_kg - w_floor) * np.exp(-k * t_vec)

        return pd.DataFrame({
            'day': t_vec,
            'projected_weight_kg': w_t,
            'metabolic_floor_kg': w_floor
        })

```

---

## 6. Frontend / Web Application Specification

### 6.1 Slider Configuration & Boundary Rules

The web application initializes target calories automatically while allowing user adjustments within safe physiological boundaries.

```javascript
// Example JS Configuration for Target Calories Slider
function getSliderConfig(userMetrics) {
  const bmr =
    9.99 * userMetrics.weightKg +
    6.25 * userMetrics.heightCm -
    4.92 * userMetrics.ageYears +
    (userMetrics.sex === "male" ? 5 : -161);

  const tdee = bmr * userMetrics.pal;

  // Default: Moderate 500 kcal deficit (~0.45 kg/week initial rate)
  const defaultTarget = Math.max(bmr, tdee - 500);

  return {
    min: Math.max(1200, Math.round(tdee * 0.5)), // Safety floor
    max: Math.min(4000, Math.round(tdee * 1.5)), // Upper limit
    default: Math.round(defaultTarget),
    step: 25, // Step size (kcal)
    tdee: Math.round(tdee),
  };
}
```

### 6.2 Dynamic UI Labels

As the user drags the slider, the interface should render feedback:

- **Caloric Deficit:** $\Delta E_0 = \text{TDEE} - \text{Target Calories}$
- **Initial Weekly Rate:** $\text{Rate}_{\text{initial}} = \frac{\Delta E_0 \times 7}{7700} \text{ kg/week}$
- **Metabolic Floor Display:** Projected long-term plateau weight ($W_{\text{floor}}$).
