import {
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
  untrack,
} from "solid-js";
import { Meta, Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import Icon from "../components/Icon";
import AccountDialog from "../components/AccountDialog";
import DishCard from "../components/DishCard";
import {
  currentUser,
  fetchDishes,
  fetchPlans,
  savedUser,
  savePlan,
  streamPlan,
  type Dish,
  type User,
} from "../lib/api";
import { locale, t } from "../lib/i18n";

export default function Planner() {
  const navigate = useNavigate();
  let promptTextarea: HTMLTextAreaElement | undefined;
  let planDateInput: HTMLInputElement | undefined;
  let recommendationStartY = 0;
  let recommendationLastY = 0;
  let recommendationLastMoveTime = 0;
  let recommendationDownwardVelocity = 0;
  let draggingRecommendation = false;
  let recommendationDidDrag = false;
  let pressedRecommendation: Dish | undefined;
  const [dishes, setDishes] = createSignal<Dish[]>([]);
  const [scheduled, setScheduled] = createSignal<Dish[]>([]);
  const [recommendations, setRecommendations] = createSignal<Dish[]>([]);
  const [recommendationReply, setRecommendationReply] = createSignal("");
  const [prompt, setPrompt] = createSignal("");
  const [promptExpanded, setPromptExpanded] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [manualOpen, setManualOpen] = createSignal(false);
  const [manualSearch, setManualSearch] = createSignal("");
  const [editing, setEditing] = createSignal(false);
  const [addingRecommendationId, setAddingRecommendationId] = createSignal("");
  const [dismissingRecommendation, setDismissingRecommendation] =
    createSignal(false);
  const [user, setUser] = createSignal<User | null>(savedUser());
  const [accountOpen, setAccountOpen] = createSignal(!savedUser());
  const [sessionChecked, setSessionChecked] = createSignal(false);
  const dateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const today = dateKey(new Date());
  const [selectedDate, setSelectedDate] = createSignal(today);
  const goal = () => "Balanced";
  const formattedPlanDate = () =>
    new Intl.DateTimeFormat(locale() === "vi" ? "vi-VN" : "en-US", {
      weekday: "long",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(`${selectedDate()}T00:00:00`));
  const matchingDishes = createMemo(() => {
    const query = manualSearch().trim().toLocaleLowerCase();
    return query
      ? dishes().filter((dish) =>
          `${dish.name} ${dish.category} ${dish.tags?.join(" ") ?? ""}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : dishes();
  });

  const loadPlanner = async (planDate: string) => {
    try {
      const [catalog, plans] = await Promise.all([
        fetchDishes(),
        fetchPlans(planDate),
      ]);
      if (planDate !== untrack(selectedDate)) return;
      setDishes(catalog);
      setScheduled(plans.find((plan) => plan.source === "manual")?.meals ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("plannerLoadError"));
    }
  };
  onSettled(() => {
    const initialPlanDate = untrack(selectedDate);
    void currentUser().then((verifiedUser) => {
      setUser(verifiedUser);
      setSessionChecked(true);
      if (verifiedUser) void loadPlanner(initialPlanDate);
      else setAccountOpen(true);
    });
  });

  const saveSchedule = async (next: Dish[]) => {
    setScheduled(next);
    try {
      await savePlan(goal(), next, selectedDate());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("plannerSaveError"));
    }
  };
  const selectDate = (nextDate: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate === selectedDate())
      return;
    setSelectedDate(nextDate);
    setEditing(false);
    setScheduled([]);
    setRecommendations([]);
    setRecommendationReply("");
    void loadPlanner(nextDate);
  };
  const moveDate = (days: number) => {
    const next = new Date(`${selectedDate()}T00:00:00`);
    next.setDate(next.getDate() + days);
    selectDate(dateKey(next));
  };
  const openDatePicker = () => {
    if (planDateInput?.showPicker) planDateInput.showPicker();
    else planDateInput?.click();
  };
  const logManualDish = (dish: Dish) => {
    if (scheduled().some((meal) => meal.id === dish.id)) {
      setNotice(`${dish.name} ${t("dishAlreadyLogged")}`);
      return;
    }
    void saveSchedule([...scheduled(), dish]);
    setManualSearch("");
    setManualOpen(false);
  };
  const removeLoggedDish = (dish: Dish) => {
    void saveSchedule(scheduled().filter((meal) => meal.id !== dish.id));
  };
  const askAssistant = async () => {
    const question = prompt().trim();
    if (!question || loading()) return;
    setPrompt("");
    if (promptTextarea) promptTextarea.style.height = "auto";
    setPromptExpanded(false);
    setLoading(true);
    setNotice("");
    setRecommendations([]);
    setRecommendationReply("");
    try {
      const result = await streamPlan(
        goal(),
        dishes(),
        question,
        locale(),
        (text) => setRecommendationReply((reply) => reply + text),
      );
      setRecommendations(result.meals);
      if (!recommendationReply())
        setRecommendationReply(result.reply ?? t("aiSuggestionFallback"));
    } catch (error) {
      setRecommendationReply(t("aiUnavailable"));
      setNotice(
        error instanceof Error ? error.message : t("aiConnectionError"),
      );
    } finally {
      setLoading(false);
    }
  };
  const dismissRecommendations = () => {
    if (dismissingRecommendation()) return;
    setDismissingRecommendation(true);
    window.setTimeout(() => {
      setRecommendations([]);
      setRecommendationReply("");
      setDismissingRecommendation(false);
    }, 280);
  };
  const addRecommendationDish = (dish: Dish) => {
    if (addingRecommendationId() || recommendationDidDrag) return;
    setAddingRecommendationId(dish.id);
    window.setTimeout(() => {
      if (!scheduled().some((meal) => meal.id === dish.id)) {
        void saveSchedule([...scheduled(), dish]);
      }
      setRecommendations((items) =>
        items.filter((item) => item.id !== dish.id),
      );
      setAddingRecommendationId("");
    }, 280);
  };
  const beginRecommendationDrag = (event: PointerEvent) => {
    if (dismissingRecommendation()) return;
    const target = event.target as Element;
    if (target.closest("button")) return;
    recommendationStartY = event.clientY;
    recommendationLastY = event.clientY;
    recommendationLastMoveTime = performance.now();
    recommendationDownwardVelocity = 0;
    recommendationDidDrag = false;
    draggingRecommendation = true;
    const sheet = event.currentTarget as HTMLElement;
    sheet.setPointerCapture(event.pointerId);
  };
  const dragRecommendation = (event: PointerEvent) => {
    if (!draggingRecommendation) return;
    const now = performance.now();
    recommendationDownwardVelocity =
      (event.clientY - recommendationLastY) /
      Math.max(now - recommendationLastMoveTime, 1);
    recommendationLastY = event.clientY;
    recommendationLastMoveTime = now;
    if (Math.abs(event.clientY - recommendationStartY) > 4) {
      recommendationDidDrag = true;
    }
    const sheet = event.currentTarget as HTMLElement;
    sheet.style.transition = "none";
    sheet.style.translate = `0 ${Math.max(0, event.clientY - recommendationStartY)}px`;
  };
  const endRecommendationDrag = (event: PointerEvent) => {
    if (!draggingRecommendation) return;
    draggingRecommendation = false;
    const distance = event.clientY - recommendationStartY;
    const sheet = event.currentTarget as HTMLElement;
    sheet.style.transition = "";
    sheet.style.translate = "";
    if (
      distance > 72 ||
      (distance > 18 && recommendationDownwardVelocity > 0.65)
    ) {
      dismissRecommendations();
    } else if (!recommendationDidDrag && pressedRecommendation) {
      addRecommendationDish(pressedRecommendation);
    }
    pressedRecommendation = undefined;
    window.setTimeout(() => {
      recommendationDidDrag = false;
    }, 0);
  };

  return (
    <main class="phone-shell">
      <Title>Thực đơn của bạn — Plasain</Title>
      <Meta
        name="description"
        content="Lên kế hoạch bữa ăn và sắp xếp thực đơn của bạn trong tuần với Plasain."
      />
      <section class="feature-screen planner-screen">
        <header class="crystal-header">
          <button
            class="back-button"
            type="button"
            onClick={() => navigate("/")}
            aria-label={t("back")}
          >
            <Icon name="arrowLeft" size={24} />
          </button>
          <h1>{t("planner")}</h1>
        </header>
        <Show
          when={sessionChecked() && user()}
          fallback={
            <div class="planner-auth-gate">
              <span>✦</span>
              <h2>
                {sessionChecked() ? t("plannerMembers") : t("checkingAccount")}
              </h2>
              <p>
                {sessionChecked() ? t("plannerMembersCopy") : t("checkingCopy")}
              </p>
              <Show when={sessionChecked()}>
                <button
                  class="primary-button"
                  onClick={() => setAccountOpen(true)}
                >
                  {t("signInContinue")}
                </button>
              </Show>
            </div>
          }
        >
          <section class="planner-canvas" aria-label="Meal plan">
            <div class="planner-day">
              <div class="planner-day-heading">
                <div class="planner-date-heading">
                  <p>
                    {selectedDate() === today
                      ? t("today")
                      : t("plannerDateLabel")}
                  </p>
                  <h2>{formattedPlanDate()}</h2>
                </div>
              </div>
              <div class="planner-day-toolbar">
                <div class="planner-date-controls">
                  <input
                    ref={(element) => {
                      planDateInput = element;
                    }}
                    class="planner-date-input"
                    type="date"
                    value={selectedDate()}
                    onInput={(event) => selectDate(event.currentTarget.value)}
                    tabindex="-1"
                  />
                  <button
                    class="planner-today-button"
                    type="button"
                    onClick={() => selectDate(today)}
                    aria-label={t("today")}
                  >
                    <Icon name="rotate" size={16} />
                  </button>
                  <button
                    class="planner-date-picker"
                    type="button"
                    onClick={() => moveDate(-1)}
                    aria-label={t("previousDay")}
                  >
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <button
                    class="planner-date-picker"
                    type="button"
                    onClick={openDatePicker}
                    aria-label={t("chooseDate")}
                  >
                    <Icon name="calendar" size={18} />
                  </button>
                  <button
                    class="planner-date-picker"
                    type="button"
                    onClick={() => moveDate(1)}
                    aria-label={t("nextDay")}
                  >
                    <Icon name="arrowRight" size={16} />
                  </button>
                </div>
                <div class="planner-day-actions">
                  <button
                    class={{ "planner-edit-trigger": true, active: editing() }}
                    type="button"
                    onClick={() => setEditing(!editing())}
                    aria-label={editing() ? t("doneEditing") : t("editPlan")}
                  >
                    <Icon name="pencil" size={18} />
                  </button>
                  <button
                    class="planner-manual-trigger"
                    type="button"
                    onClick={() => setManualOpen(true)}
                    aria-label={t("logMeal")}
                  >
                    <Icon name="plus" size={20} />
                  </button>
                </div>
              </div>
              <Show when={editing()}>
                <p class="planner-edit-hint">{t("clickDishToRemove")}</p>
              </Show>
              <Show
                when={scheduled().length}
                fallback={
                  <button
                    class="planner-empty"
                    type="button"
                    onClick={() => setManualOpen(true)}
                  >
                    <p>{t("noMealsLogged")}</p>
                  </button>
                }
              >
                <div class="planner-meal-row">
                  <For each={scheduled()}>
                    {(dish) => (
                      <DishCard
                        dish={dish}
                        class={{
                          "planner-meal": true,
                          "is-editing": editing(),
                        }}
                        onSelect={
                          editing() ? () => removeLoggedDish(dish) : undefined
                        }
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <Show when={manualOpen()}>
              <div
                class="planner-manual-overlay"
                role="presentation"
                onClick={() => setManualOpen(false)}
              >
                <section
                  class="planner-manual-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("logMealTitle")}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    class="planner-manual-close"
                    type="button"
                    onClick={() => setManualOpen(false)}
                    aria-label={t("close")}
                  >
                    <Icon name="x" size={20} />
                  </button>
                  <h2>{t("logMealTitle")}</h2>
                  <label class="planner-dish-search">
                    <Icon name="search" size={17} />
                    <input
                      value={manualSearch()}
                      onInput={(event) =>
                        setManualSearch(event.currentTarget.value)
                      }
                      placeholder={t("searchDishes")}
                      autofocus
                    />
                  </label>
                  <div class="planner-dish-results">
                    <For
                      each={matchingDishes()}
                      fallback={<p>{t("noDishesFound")}</p>}
                    >
                      {(dish) => (
                        <DishCard
                          dish={dish}
                          class="planner-meal"
                          onSelect={() => logManualDish(dish)}
                        />
                      )}
                    </For>
                  </div>
                </section>
              </div>
            </Show>
            <Show
              when={recommendationReply().trim() || recommendations().length}
            >
              <section
                class={{
                  "planner-recommendation": true,
                  "is-dismissing": dismissingRecommendation(),
                }}
                aria-label={t("aiRecommendations")}
                onPointerDown={beginRecommendationDrag}
                onPointerMove={dragRecommendation}
                onPointerUp={endRecommendationDrag}
                onPointerCancel={endRecommendationDrag}
              >
                <div class="planner-recommendation-inner">
                  <button
                    class="planner-recommendation-close"
                    type="button"
                    onClick={dismissRecommendations}
                    aria-label={t("aiDismissed")}
                  >
                    <Icon name="x" size={20} />
                  </button>
                  <h2>{t("aiRecommendations")}</h2>
                  <p class="planner-ai-reply">{recommendationReply()}</p>
                  <Show when={recommendations().length}>
                    <div class="planner-recommendation-cards">
                      <For each={recommendations()}>
                        {(dish) => (
                          <DishCard
                            dish={dish}
                            class={{
                              "planner-meal": true,
                              "planner-recommendation-card": true,
                              "is-adding": addingRecommendationId() === dish.id,
                            }}
                            onPointerDown={() => {
                              pressedRecommendation = dish;
                            }}
                            onSelect={() => addRecommendationDish(dish)}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </section>
            </Show>
            <section class="planner-chatbox" aria-label={t("askAi")}>
              <form
                class={{
                  "planner-prompt": true,
                  "is-multiline": promptExpanded(),
                  "has-text": Boolean(prompt().trim()),
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void askAssistant();
                }}
              >
                <Show
                  when={loading()}
                  fallback={
                    <>
                      <textarea
                        ref={(element) => {
                          promptTextarea = element;
                        }}
                        rows={1}
                        value={prompt()}
                        onInput={(event) => {
                          setPrompt(event.currentTarget.value);
                          event.currentTarget.style.height = "auto";
                          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 96)}px`;
                          setPromptExpanded(
                            event.currentTarget.scrollHeight > 20,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void askAssistant();
                          }
                        }}
                        aria-label={t("askAi")}
                        placeholder={t("askAi")}
                      />
                      <button type="submit" aria-label={t("askAi")}>
                        <Icon name="arrowUp" size={16} />
                      </button>
                    </>
                  }
                >
                  <div
                    class="planner-thinking"
                    role="status"
                    aria-live="polite"
                  >
                    <div class="planner-thinking-content">
                      <span>{t("aiThinking")}</span>
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </Show>
              </form>
              <Show when={notice()}>
                <p class="inline-notice">{notice()}</p>
              </Show>
            </section>
          </section>
        </Show>
        <Show when={accountOpen()}>
          <AccountDialog
            user={user()}
            onUserChange={(nextUser) => {
              setUser(nextUser);
              if (nextUser) void loadPlanner();
            }}
            onClose={() => {
              setAccountOpen(false);
              if (!user()) navigate("/");
            }}
          />
        </Show>
      </section>
    </main>
  );
}
