import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onSettled,
  Show,
} from "solid-js";
import { Meta, Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import Icon from "../components/Icon";
import {
  currentUser,
  fetchPlans,
  projectWeight,
  savedUser,
  type CheckIn,
  type RegressorResult,
  type SavedPlan,
} from "../lib/api";
import { t } from "../lib/i18n";
import "../styles/regressor.css";

type CheckInRow = Partial<CheckIn> & { date: string };
const isoDay = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const emptyCheckIns = (): CheckInRow[] =>
  Array.from({ length: 7 }, () => ({ date: "" }));

function WeightChart(props: { result: RegressorResult }) {
  const [zoom, setZoom] = createSignal(1);
  let pinchDistance: number | undefined;
  const setClampedZoom = (next: number) =>
    setZoom(Math.max(1, Math.min(3, next)));
  const touchDistance = (touches: TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  const visibleTrajectory = createMemo(() => {
    const count = Math.max(
      2,
      Math.round(props.result.trajectory.length / zoom()),
    );
    return props.result.trajectory.slice(-count);
  });
  const points = createMemo(() => {
    const values = visibleTrajectory().map((item) => item.projected_weight_kg);
    const high = Math.max(...values) + 0.25;
    const low = Math.min(...values) - 0.25;
    const range = Math.max(high - low, 1);
    return visibleTrajectory()
      .map(
        (item, index) =>
          `${18 + (index / Math.max(values.length - 1, 1)) * 284},${12 + ((high - item.projected_weight_kg) / range) * 128}`,
      )
      .join(" ");
  });
  return (
    <div
      class="regressor-chart"
      role="application"
      aria-label={t("regressorChartLabel")}
      onWheel={(event) => {
        event.preventDefault();
        setClampedZoom(zoom() + (event.deltaY < 0 ? 0.2 : -0.2));
      }}
      onTouchStart={(event) => {
        if (event.touches.length === 2)
          pinchDistance = touchDistance(event.touches);
      }}
      onTouchMove={(event) => {
        if (event.touches.length !== 2 || !pinchDistance) return;
        event.preventDefault();
        const nextDistance = touchDistance(event.touches);
        setClampedZoom(zoom() * (nextDistance / pinchDistance));
        pinchDistance = nextDistance;
      }}
      onTouchEnd={() => {
        pinchDistance = undefined;
      }}
    >
      <div class="chart-axis chart-axis-top">
        {visibleTrajectory()[0].projected_weight_kg.toFixed(1)} kg
      </div>
      <svg viewBox="0 0 320 164" preserveAspectRatio="none">
        <line x1="18" y1="140" x2="302" y2="140" class="chart-grid" />
        <line x1="18" y1="76" x2="302" y2="76" class="chart-grid" />
        <polyline points={points()} class="chart-line" />
        <circle cx="18" cy="12" r="4" class="chart-dot" />
      </svg>
      <div class="chart-labels">
        <span>
          {t("regressorDay")} {visibleTrajectory()[0].day}
        </span>
        <span>
          {t("regressorDay")}{" "}
          {visibleTrajectory()[Math.floor(visibleTrajectory().length / 2)].day}
        </span>
        <span>{t("regressorDay")} 90</span>
      </div>
    </div>
  );
}

export default function Regressor() {
  const navigate = useNavigate();
  const [height, setHeight] = createSignal<number>();
  const [age, setAge] = createSignal<number>();
  const [sex, setSex] = createSignal<"female" | "male">();
  const [pal, setPal] = createSignal<number>();
  const [logs, setLogs] = createSignal<CheckInRow[]>(emptyCheckIns());
  const [target, setTarget] = createSignal<number>();
  const [result, setResult] = createSignal<RegressorResult>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [plannerMessage, setPlannerMessage] = createSignal("");
  const [checkInTab, setCheckInTab] = createSignal<"manual" | "planner">(
    "manual",
  );
  const [startDate, setStartDate] = createSignal(isoDay(-6));
  const [endDate, setEndDate] = createSignal(isoDay(0));
  let sliderTimer: number | undefined;
  let projectionVersion = 0;
  const completeCheckIns = createMemo<CheckIn[]>(() =>
    logs().flatMap((log) =>
      [
        log.weight_kg,
        log.calories,
        log.protein_g,
        log.carbs_g,
        log.sodium_mg,
      ].every(Number.isFinite)
        ? [
            {
              weight_kg: log.weight_kg!,
              calories: log.calories!,
              protein_g: log.protein_g!,
              carbs_g: log.carbs_g!,
              sodium_mg: log.sodium_mg!,
            },
          ]
        : [],
    ),
  );
  const latestWeight = () => completeCheckIns().at(-1)?.weight_kg;
  const estimatedTdee = createMemo(() => {
    const weight = latestWeight();
    if (!weight || !height() || !age() || !sex() || !pal()) return;
    return Math.round(
      (9.99 * weight +
        6.25 * height()! -
        4.92 * age()! +
        (sex() === "male" ? 5 : -161)) *
        pal()!,
    );
  });
  const sliderMin = createMemo(() => {
    const tdee = estimatedTdee();
    return tdee
      ? Math.max(1200, Math.round((tdee * 0.5) / 25) * 25)
      : undefined;
  });
  const sliderMax = createMemo(() => {
    const tdee = estimatedTdee();
    return tdee
      ? Math.min(4000, Math.round((tdee * 1.5) / 25) * 25)
      : undefined;
  });
  const deficit = createMemo(() => {
    const tdee = estimatedTdee();
    return tdee !== undefined && target() !== undefined
      ? tdee - target()!
      : undefined;
  });
  const rate = createMemo(() =>
    deficit() === undefined ? undefined : (deficit()! * 7) / 7700,
  );
  const missingData = createMemo(() => {
    const missing: string[] = [];
    if (!height()) missing.push(t("regressorHeight"));
    if (!age()) missing.push(t("regressorAge"));
    if (!sex()) missing.push(t("regressorSex"));
    if (!pal()) missing.push(t("regressorActivity"));
    const remaining = Math.max(0, 7 - completeCheckIns().length);
    if (remaining) missing.push(`${remaining} ${t("regressorCheckinsNeeded")}`);
    return missing;
  });
  const setLog = (
    index: number,
    field: keyof CheckIn | "date",
    value: string,
  ) => {
    setLogs((items) =>
      items.map((item, row) =>
        row === index
          ? {
              ...item,
              [field]:
                field === "date"
                  ? value
                  : value === ""
                    ? undefined
                    : Number(value),
            }
          : item,
      ),
    );
    scheduleProjection();
  };
  const project = async () => {
    if (
      !height() ||
      !age() ||
      !sex() ||
      !pal() ||
      !target() ||
      completeCheckIns().length < 7
    ) {
      setResult();
      return;
    }
    const version = ++projectionVersion;
    const input = {
      height_cm: height()!,
      age_years: age()!,
      sex: sex()!,
      pal: pal()!,
      target_calories: target()!,
      check_ins: completeCheckIns(),
    };
    setError("");
    try {
      const nextResult = await projectWeight(input);
      if (version === projectionVersion) setResult(nextResult);
    } catch (cause) {
      if (version === projectionVersion) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("regressorProjectionError"),
        );
      }
    }
  };
  const scheduleProjection = () => {
    if (sliderTimer) window.clearTimeout(sliderTimer);
    const tdee = estimatedTdee();
    if (target() === undefined && tdee !== undefined) {
      const min = sliderMin()!;
      const max = sliderMax()!;
      setTarget(
        Math.min(max, Math.max(min, Math.round((tdee - 500) / 25) * 25)),
      );
    }
    sliderTimer = window.setTimeout(() => void project(), 160);
  };
  const usePlannerCheckIns = async () => {
    if (!savedUser()) {
      setPlannerMessage(t("regressorPlannerSignIn"));
      return;
    }
    if (startDate() > endDate()) {
      setPlannerMessage(t("regressorPlannerDateOrder"));
      return;
    }
    setPlannerMessage("");
    setBusy(true);
    try {
      const latestByDate = new Map<string, SavedPlan>();
      for (const plan of await fetchPlans(undefined, {
        startDate: startDate(),
        endDate: endDate(),
      }))
        if (!latestByDate.has(plan.plan_date))
          latestByDate.set(plan.plan_date, plan);
      const plans = [...latestByDate.values()].sort((a, b) =>
        a.plan_date.localeCompare(b.plan_date),
      );
      if (plans.length < 7) {
        setPlannerMessage(t("regressorPlannerMinimum"));
        return;
      }
      if (plans.length > 60) {
        setPlannerMessage(t("regressorPlannerMaximum"));
        return;
      }
      const imported = plans.map((plan) => ({
        date: plan.plan_date,
        calories: plan.meals.reduce((total, meal) => total + meal.calories, 0),
        protein_g: plan.meals.reduce((total, meal) => total + meal.protein, 0),
        carbs_g: plan.meals.reduce((total, meal) => total + meal.carbs, 0),
        sodium_mg: plan.meals.reduce(
          (total, meal) => total + meal.sodium_mg,
          0,
        ),
      }));
      setLogs(imported);
      setPlannerMessage(t("regressorPlannerImported"));
      scheduleProjection();
    } catch (cause) {
      setPlannerMessage(
        cause instanceof Error ? cause.message : t("regressorPlannerLoadError"),
      );
    } finally {
      setBusy(false);
    }
  };
  onCleanup(() => {
    if (sliderTimer) window.clearTimeout(sliderTimer);
  });
  onSettled(() => {
    const applyProfile = (user: ReturnType<typeof savedUser>) => {
      if (user?.height_cm) setHeight(user.height_cm);
      if (user?.biological_sex) setSex(user.biological_sex);
      if (user?.birth_year) setAge(new Date().getFullYear() - user.birth_year);
      if (user?.activity_level) setPal(user.activity_level);
    };
    applyProfile(savedUser());
    void currentUser().then(applyProfile);
  });
  return (
    <main class="phone-shell">
      <Title>Theo dõi dinh dưỡng — Plasain</Title>
      <Meta
        name="description"
        content="Theo dõi dinh dưỡng và mục tiêu năng lượng hằng ngày theo cách phù hợp với bạn."
      />
      <section class="feature-screen regressor-screen">
        <header class="regressor-header">
          <button
            class="back-button"
            onClick={() => navigate("/")}
            aria-label={t("back")}
          >
            <Icon name="arrowLeft" size={24} />
          </button>
          <h1>{t("regressorTitle")}</h1>
        </header>
        <form
          class="regressor-form"
          onSubmit={(event) => {
            event.preventDefault();
            void project();
          }}
        >
          <details class="regressor-details">
            <summary>{t("regressorAssumptions")}</summary>
            <div class="regressor-input-grid">
              <label>
                {t("regressorHeight")}{" "}
                <input
                  type="number"
                  min="80"
                  max="260"
                  value={height()}
                  onInput={(event) => {
                    setHeight(
                      event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : undefined,
                    );
                    scheduleProjection();
                  }}
                />
                <small>cm</small>
              </label>
              <label>
                {t("regressorAge")}{" "}
                <input
                  type="number"
                  min="18"
                  max="100"
                  value={age()}
                  onInput={(event) => {
                    setAge(
                      event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : undefined,
                    );
                    scheduleProjection();
                  }}
                />
                <small>{t("regressorYears")}</small>
              </label>
              <label>
                {t("regressorSex")}{" "}
                <select
                  value={sex()}
                  onChange={(event) => {
                    setSex(event.currentTarget.value as "female" | "male");
                    scheduleProjection();
                  }}
                >
                  <option value="">{t("regressorSelectSex")}</option>
                  <option value="female">{t("female")}</option>
                  <option value="male">{t("male")}</option>
                </select>
              </label>
              <label>
                {t("regressorActivity")}{" "}
                <select
                  value={pal()}
                  onChange={(event) => {
                    setPal(
                      event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : undefined,
                    );
                    scheduleProjection();
                  }}
                >
                  <option value="">{t("regressorSelectActivity")}</option>
                  <option value="1.2">{t("activityLow")}</option>
                  <option value="1.45">{t("activityLight")}</option>
                  <option value="1.65">{t("activityModerate")}</option>
                  <option value="1.85">{t("activityHigh")}</option>
                </select>
              </label>
            </div>
          </details>
          <details class="regressor-details checkin-fieldset">
            <summary>{t("regressorCheckins")}</summary>
            <div
              class="checkin-tabs"
              role="tablist"
              aria-label={t("regressorCheckinSource")}
            >
              <button
                class={{ active: checkInTab() === "manual" }}
                type="button"
                role="tab"
                aria-selected={checkInTab() === "manual" ? "true" : "false"}
                onClick={() => setCheckInTab("manual")}
              >
                {t("regressorManualInput")}
              </button>
              <button
                class={{ active: checkInTab() === "planner" }}
                type="button"
                role="tab"
                aria-selected={checkInTab() === "planner" ? "true" : "false"}
                onClick={() => setCheckInTab("planner")}
              >
                {t("regressorPlannerHistory")}
              </button>
            </div>
            <Show when={checkInTab() === "manual"}>
              <div class="manual-checkins">
                <p class="field-note">{t("regressorManualHelp")}</p>
                <div class="checkin-cards">
                  <For each={logs()}>
                    {(log, index) => (
                      <article class="checkin-card">
                        <div class="checkin-card-heading">
                          <b>
                            {t("regressorCheckin")} {index() + 1}
                          </b>
                          <input
                            aria-label={`${t("regressorCheckin")} ${index() + 1} ${t("regressorDate")}`}
                            type="date"
                            value={log.date}
                            onInput={(event) =>
                              setLog(index(), "date", event.currentTarget.value)
                            }
                          />
                        </div>
                        <div class="checkin-card-grid">
                          <label>
                            {t("regressorWeight")}{" "}
                            <input
                              aria-label={`${t("regressorCheckin")} ${index() + 1} ${t("regressorWeight")}`}
                              type="number"
                              step=".1"
                              value={log.weight_kg}
                              onInput={(event) =>
                                setLog(
                                  index(),
                                  "weight_kg",
                                  event.currentTarget.value,
                                )
                              }
                            />
                            <span>kg</span>
                          </label>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={checkInTab() === "planner"}>
              <div class="planner-history">
                <p>{t("regressorPlannerHelp")}</p>
                <div class="planner-range">
                  <label>
                    {t("regressorFrom")}{" "}
                    <input
                      type="date"
                      value={startDate()}
                      onInput={(event) =>
                        setStartDate(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label>
                    {t("regressorTo")}{" "}
                    <input
                      type="date"
                      value={endDate()}
                      onInput={(event) => setEndDate(event.currentTarget.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  class="planner-import-button"
                  disabled={busy()}
                  onClick={() => void usePlannerCheckIns()}
                >
                  {t("regressorImportRange")}
                </button>
                <Show when={plannerMessage()}>
                  <p class="planner-import-note">{plannerMessage()}</p>
                </Show>
              </div>
            </Show>
          </details>
          <section
            class="target-fieldset"
            aria-labelledby="calorie-target-title"
          >
            <h2 id="calorie-target-title">{t("regressorDailyTarget")}</h2>
            <div class="target-number">
              <output>{target() ?? "–"}</output>
              <span>{t("regressorKcalPerDay")}</span>
            </div>
            <input
              class="target-slider"
              type="range"
              min={sliderMin()}
              max={sliderMax()}
              step="25"
              value={target()}
              disabled={target() === undefined}
              onInput={(event) => {
                setTarget(Number(event.currentTarget.value));
                scheduleProjection();
              }}
            />
            <div class="slider-limits">
              <span>{sliderMin() ?? "–"} kcal</span>
              <span>{sliderMax() ?? "–"} kcal</span>
            </div>
            <div class="target-feedback">
              <span>
                <b>{deficit() === undefined ? "–" : `${deficit()} kcal`}</b>{" "}
                {t("regressorFromTdee")}
              </span>
              <span>
                <b>
                  {rate() === undefined
                    ? "–"
                    : `${Math.abs(rate()!).toFixed(2)} kg/week`}
                </b>{" "}
                {t("regressorInitial")}{" "}
                {rate() === undefined
                  ? t("regressorChange")
                  : rate()! >= 0
                    ? t("regressorLoss")
                    : t("regressorGain")}{" "}
                {t("regressorRate")}
              </span>
            </div>
          </section>
        </form>
        <Show when={error()}>
          <p class="regressor-error">{error()}</p>
        </Show>
        <section class="projection-result">
          <Show when={missingData().length > 0}>
            <aside class="regressor-missing-banner" role="status">
              <b>{t("regressorDataNeeded")}</b>
              <span>{missingData().join(" · ")}</span>
            </aside>
          </Show>
          <div class="result-heading">
            <div>
              <span class="historian-label">{t("regressorHistorian")}</span>
              <h2>
                {result()?.clean_baseline_kg.toFixed(1) ?? "–"}
                {result() ? " kg" : ""}
              </h2>
              <p>
                {result()
                  ? `Scale: ${result()!.current_weight_kg.toFixed(1)} kg · ${result()!.trend_method}`
                  : t("regressorBaselineHelp")}
              </p>
            </div>
            <div class="result-stat">
              <span>{t("regressorEstimatedTdee")}</span>
              <b>{result() ? `${result()!.tdee} kcal` : "–"}</b>
            </div>
          </div>
          <div class="engine-two-label">{t("regressorTimeMachine")}</div>
          <Show
            when={result()}
            fallback={<div class="chart-unavailable">–</div>}
          >
            {(data) => <WeightChart result={data()} />}
          </Show>
          <div class="projection-summary">
            <div>
              <span>{t("regressorNinetyDayEstimate")}</span>
              <b>
                {result()?.trajectory.at(-1)?.projected_weight_kg.toFixed(1) ??
                  "–"}
                {result() ? " kg" : ""}
              </b>
            </div>
            <div>
              <span>{t("regressorMetabolicFloor")}</span>
              <b>
                {result()?.metabolic_floor_kg.toFixed(1) ?? "–"}
                {result() ? " kg" : ""}
              </b>
            </div>
          </div>
          <p class="projection-note">{t("regressorProjectionNote")}</p>
        </section>
      </section>
    </main>
  );
}
