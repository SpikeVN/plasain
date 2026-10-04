import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onSettled,
  Show,
  untrack,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import Icon from "../components/Icon";
import AccountDialog from "../components/AccountDialog";
import DishCard from "../components/DishCard";
import {
  addDish,
  currentUser,
  dishImageSource,
  fetchDishes,
  isDishImage,
  removeDish,
  savedUser,
  updateDish,
  uploadDishImage,
  type Dish,
  type User,
} from "../lib/api";
import { t } from "../lib/i18n";
import {
  CARD_STEP,
  forwardTarget,
  modulo,
  reelOffset,
  sampleMotion,
  type Motion,
} from "../lib/carousel-motion";

// Add, remove, or rewrite the messages shown after each completed spin.
const LOOP_CYCLES = 9;
const builtinTagKeys: Record<string, string> = {
  balanced: "balanced",
  breakfast: "breakfast",
  "high protein": "highProtein",
  pescatarian: "pescatarian",
  "plant-based": "plantBased",
  snack: "snack",
  vegan: "vegan",
  vegetarian: "vegetarian",
  vietnamese: "vietnamese",
};
const tagLabel = (tag: string) => {
  const key = builtinTagKeys[tag.toLocaleLowerCase()];
  return key ? t(key) : tag;
};

function DishVisual(props: { image: string; class: string }) {
  return (
    <Show when={isDishImage(props.image)} fallback={<span>{props.image}</span>}>
      {() => (
        <img
          class={props.class}
          src={dishImageSource(props.image)}
          alt=""
          draggable="false"
        />
      )}
    </Show>
  );
}

function DishReceipt(props: {
  dish: Dish;
  discarded?: boolean;
  initialY?: number;
  onDiscard?: (distance: number) => void;
}) {
  let startY = 0;
  let lastY = 0;
  let lastMoveTime = 0;
  let downwardVelocity = 0;
  let dragging = false;
  let returnTimer: number | undefined;
  const beginDismissDrag = (event: PointerEvent) => {
    if (props.discarded) return;
    startY = event.clientY;
    if (returnTimer) window.clearTimeout(returnTimer);
    event.currentTarget.style.transition = "none";
    lastY = event.clientY;
    lastMoveTime = performance.now();
    downwardVelocity = 0;
    dragging = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDismissDrag = (event: PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    downwardVelocity =
      (event.clientY - lastY) / Math.max(now - lastMoveTime, 1);
    lastY = event.clientY;
    lastMoveTime = now;
    const distance = Math.max(0, event.clientY - startY);
    event.currentTarget.style.translate = `0 ${distance}px`;
  };
  const endDismissDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const distance = event.clientY - startY;
    if (distance > 72 || (distance > 18 && downwardVelocity > 0.65)) {
      event.currentTarget.style.transition = "";
      props.onDiscard?.(distance);
      return;
    }
    event.currentTarget.style.transition =
      "translate .28s cubic-bezier(.2,.8,.2,1)";
    event.currentTarget.style.translate = "";
    const receipt = event.currentTarget;
    returnTimer = window.setTimeout(() => {
      receipt.style.transition = "";
      returnTimer = undefined;
    }, 300);
  };
  return (
    <article
      class={{
        "crystal-result": true,
        "crystal-result-discarded": props.discarded,
      }}
      style={{
        translate: props.initialY ? `0 ${props.initialY}px` : undefined,
      }}
      onPointerDown={beginDismissDrag}
      onPointerMove={moveDismissDrag}
      onPointerUp={endDismissDrag}
      onPointerCancel={endDismissDrag}
    >
      <div class="crystal-result-image">
        <DishVisual image={props.dish.image} class="dish-photo" />
      </div>
      <div class="crystal-result-copy">
        <h2>{props.dish.name}</h2>
        <p>
          {props.dish.calories} kcal <b>·</b> {props.dish.protein}g{" "}
          {t("protein")}
        </p>
        <p>
          {props.dish.carbs}g {t("carbs")} <b>·</b> {props.dish.fat}g fat
        </p>
        <div class="crystal-tags">
          <For each={props.dish.tags ?? [props.dish.category]}>
            {(tag) => <span>{tagLabel(tag)}</span>}
          </For>
        </div>
      </div>
    </article>
  );
}

export default function CrystalBall() {
  const navigate = useNavigate();
  const [dishes, setDishes] = createSignal<Dish[]>([]);
  const [picked, setPicked] = createSignal<Dish>();
  const [discarded, setDiscarded] = createSignal<Dish>();
  const [discardedOffset, setDiscardedOffset] = createSignal(0);
  const [offset, setOffset] = createSignal(0, { name: "carouselPosition" });
  const [loading, setLoading] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [settling, setSettling] = createSignal(false);
  const [message, setMessage] = createSignal(untrack(() => t("crystalHint")));
  const [messageVersion, setMessageVersion] = createSignal(1);
  const [user, setUser] = createSignal<User | null>(savedUser());
  const [addOpen, setAddOpen] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [filterOpen, setFilterOpen] = createSignal(false);
  const [selectedTags, setSelectedTags] = createSignal<string[]>([]);
  const [editing, setEditing] = createSignal<Dish>();
  const [deletingDish, setDeletingDish] = createSignal<Dish>();
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [deleteMessage, setDeleteMessage] = createSignal("");
  const [accountOpen, setAccountOpen] = createSignal(false);
  const [addBusy, setAddBusy] = createSignal(false);
  const [addMessage, setAddMessage] = createSignal("");
  const [tagDraft, setTagDraft] = createSignal("");
  const [tags, setTags] = createSignal<string[]>([]);
  const [dishImage, setDishImage] = createSignal("");
  const [dishCropSource, setDishCropSource] = createSignal("");
  const [dishCropOpen, setDishCropOpen] = createSignal(false);
  const presetTagKeys = [
    "vegan",
    "breakfast",
    "lunch",
    "dinner",
    "snack",
    "halal",
    "kosher",
    "diabetic",
    "lactoseIntolerant",
  ] as const;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let lastDragX = 0;
  let lastDragTime = 0;
  let dragVelocity = 0;
  let boostDistance = 0;
  let motion: Motion | undefined;
  // Imperative motion reads must see the latest sample even before Solid's
  // batched DOM update commits. The signal is the reactive rendering channel.
  let position = 0;
  const updatePosition = (value: number) => {
    position = value;
    setOffset(value);
  };
  let motionFrame: number | undefined;
  let motionComplete: (() => void) | undefined;
  let activePointer: number | undefined;
  let dragBoosting = false;
  let discardTimer: number | undefined;
  let suppressSpin = false;
  let dishCropImage: HTMLImageElement | undefined;
  let dishCropper: Cropper | undefined;
  const availableTags = createMemo(() =>
    [
      ...new Set(
        dishes().flatMap((dish) =>
          dish.tags?.length ? dish.tags : [dish.category],
        ),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );
  const activeDishes = createMemo(() => {
    const filters = selectedTags();
    return filters.length
      ? dishes().filter((dish) => {
          const dishTags = dish.tags?.length ? dish.tags : [dish.category];
          return filters.every((tag) =>
            dishTags.some(
              (dishTag) =>
                dishTag.toLocaleLowerCase() === tag.toLocaleLowerCase(),
            ),
          );
        })
      : dishes();
  });
  const makeReel = (catalog: Dish[]) => {
    return Array.from(
      { length: catalog.length * LOOP_CYCLES },
      (_, index) => catalog[index % catalog.length],
    );
  };
  const choices = createMemo(() => makeReel(activeDishes()), {
    name: "carouselReel",
  });
  const renderedOffset = createMemo(
    () => reelOffset(offset(), activeDishes().length),
    { name: "carouselRenderedPosition" },
  );
  const loadDishes = async () =>
    fetchDishes().then((data) => {
      setDishes(data);
      refreshFilteredReel();
    });
  onSettled(() => {
    void loadDishes();
    if (savedUser())
      void currentUser()
        .then(setUser)
        .catch(() => setUser(null));
  });
  const openDishForm = (dish?: Dish) => {
    if (!user()) {
      setAccountOpen(true);
      return;
    }
    setEditing(dish);
    setAddMessage("");
    setTagDraft("");
    setTags(dish?.tags ?? (dish ? [dish.category] : []));
    setDishImage(dish && isDishImage(dish.image) ? dish.image : "");
    setAddOpen(true);
  };
  const openDishMenu = () => {
    if (!user()) {
      setAccountOpen(true);
      return;
    }
    setMenuOpen(true);
  };
  const ownedDishes = () =>
    dishes().filter((dish) => dish.id.startsWith(`user-${user()?.id}-`));
  const addTag = () => {
    const tag = tagDraft().trim();
    if (
      !tag ||
      tags().some(
        (item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase(),
      )
    )
      return;
    setTags((items) => [...items, tag]);
    setTagDraft("");
  };
  const toggleTag = (tag: string) =>
    setTags((items) =>
      items.includes(tag)
        ? items.filter((item) => item !== tag)
        : [...items, tag],
    );
  const refreshFilteredReel = () => {
    cancelMotion();
    activePointer = undefined;
    setDragging(false);
    setLoading(false);
    setSettling(false);
    setPicked();
    setDiscarded();
    updatePosition(0);
  };
  const toggleFilterTag = (tag: string) => {
    setSelectedTags((tags) =>
      tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag],
    );
    refreshFilteredReel();
  };
  const clearFilters = () => {
    setSelectedTags([]);
    refreshFilteredReel();
  };
  const chooseDishImage = (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAddMessage(t("imageFileOnly"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDishCropSource(String(reader.result));
      setDishCropOpen(true);
    };
    reader.readAsDataURL(file);
  };
  createEffect(dishCropOpen, (isOpen) => {
    if (!isOpen || !dishCropImage) return;
    dishCropper?.destroy();
    dishCropper = new Cropper(dishCropImage, {
      aspectRatio: 4 / 3,
      viewMode: 1,
      autoCropArea: 1,
      background: false,
      responsive: true,
    });
    onCleanup(() => {
      dishCropper?.destroy();
      dishCropper = undefined;
    });
  });
  const saveDishCrop = () => {
    const canvas = dishCropper?.getCroppedCanvas({
      width: 600,
      height: 450,
      imageSmoothingQuality: "high",
    });
    if (!canvas) return;
    setDishImage(canvas.toDataURL("image/jpeg", 0.82));
    setDishCropOpen(false);
  };
  const submitDish = async (event: SubmitEvent) => {
    event.preventDefault();
    setAddBusy(true);
    setAddMessage("");
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      const category = String(form.get("category") || "").trim();
      const dishTags = tags().length ? tags() : category ? [category] : [];
      const uploadedImage = dishImage().startsWith("data:")
        ? await uploadDishImage(dishImage())
        : dishImage();
      const draft = {
        name: String(form.get("name") || ""),
        category: dishTags[0] || category,
        tags: dishTags,
        calories: Number(form.get("calories")),
        protein: Number(form.get("protein")),
        carbs: Number(form.get("carbs")),
        fat: Number(form.get("fat")),
        sodium_mg: Number(form.get("sodium_mg")),
        image: uploadedImage || String(form.get("emoji") || "🍽️"),
        description: String(form.get("description") || ""),
      };
      if (editing()) await updateDish(editing()!.id, draft);
      else await addDish(draft);
      await loadDishes();
      setAddOpen(false);
    } catch (error) {
      setAddMessage(
        error instanceof Error ? error.message : "Could not add that dish.",
      );
    } finally {
      setAddBusy(false);
    }
  };
  const confirmDeleteDish = async () => {
    const dish = deletingDish();
    if (!dish) return;
    setDeleteBusy(true);
    setDeleteMessage("");
    try {
      await removeDish(dish.id);
      await loadDishes();
      setDeletingDish();
    } catch (error) {
      setDeleteMessage(
        error instanceof Error ? error.message : t("deleteDishError"),
      );
    } finally {
      setDeleteBusy(false);
    }
  };
  const cancelMotion = () => {
    if (motionFrame !== undefined) window.cancelAnimationFrame(motionFrame);
    motionFrame = undefined;
    motion = undefined;
    motionComplete = undefined;
  };
  const animateTo = (to: number, duration: number, complete: () => void) => {
    // Retarget from the current trajectory, not its old destination.
    const now = performance.now();
    const from = motion ? sampleMotion(motion, now) : position;
    cancelMotion();
    updatePosition(from);
    motion = { from, to, started: now, duration };
    motionComplete = complete;
    const tick = (time: number) => {
      if (!motion) return;
      updatePosition(sampleMotion(motion, time));
      if (time >= motion.started + motion.duration) {
        const done = motionComplete;
        cancelMotion();
        done?.();
      } else {
        motionFrame = window.requestAnimationFrame(tick);
      }
    };
    motionFrame = window.requestAnimationFrame(tick);
  };
  const selectedAt = (position: number) =>
    activeDishes()[
      modulo(Math.round(position / CARD_STEP), activeDishes().length)
    ];
  const finishSpin = () => {
    setPicked(selectedAt(position));
    setMessage(t("crystalHint"));
    setMessageVersion((version) => version + 1);
    setLoading(false);
  };
  const finishSettle = () => {
    setPicked(selectedAt(position));
    setSettling(false);
  };
  onCleanup(() => {
    cancelMotion();
    if (discardTimer !== undefined) window.clearTimeout(discardTimer);
  });
  const discardPickedDish = (dragDistance = 0) => {
    const current = picked();
    if (!current) return;
    if (discardTimer) window.clearTimeout(discardTimer);
    setDiscardedOffset(Math.max(0, dragDistance));
    setDiscarded(current);
    setPicked();
    discardTimer = window.setTimeout(() => setDiscarded(), 260);
  };
  const boostSpin = () => {
    if (!loading() || !motion) return;
    const target = motion.to + 8 * CARD_STEP;
    const duration = Math.max(1100, motion.duration - 400);
    animateTo(target, duration, finishSpin);
  };
  const spin = () => {
    if (loading()) {
      boostSpin();
      return;
    }
    if (settling() || dragging() || !activeDishes().length) return;
    const availableDishes = activeDishes();
    const current = selectedAt(position);
    const alternatives = availableDishes.filter(
      (dish) => dish.id !== current.id,
    );
    const next =
      alternatives[Math.floor(Math.random() * alternatives.length)] ?? current;
    discardPickedDish();
    setLoading(true);
    animateTo(
      forwardTarget(
        position,
        availableDishes.indexOf(next),
        availableDishes.length,
      ),
      3200,
      finishSpin,
    );
  };
  const beginDrag = (
    event: PointerEvent & { currentTarget: HTMLDivElement },
  ) => {
    if (
      settling() ||
      !activeDishes().length ||
      activePointer !== undefined ||
      event.button !== 0
    )
      return;
    activePointer = event.pointerId;
    dragBoosting = loading();
    dragStartX = event.clientX;
    dragStartOffset = position;
    lastDragX = event.clientX;
    lastDragTime = performance.now();
    dragVelocity = 0;
    boostDistance = 0;
    suppressSpin = false;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: PointerEvent) => {
    if (!dragging() || event.pointerId !== activePointer) return;
    if (dragBoosting) {
      const movement = event.clientX - lastDragX;
      lastDragX = event.clientX;
      if (Math.abs(event.clientX - dragStartX) > 4) suppressSpin = true;
      boostDistance += Math.abs(movement);
      if (boostDistance >= 32) {
        boostSpin();
        boostDistance = 0;
      }
      return;
    }
    const now = performance.now();
    const elapsed = Math.max(now - lastDragTime, 1);
    dragVelocity = -(event.clientX - lastDragX) / elapsed;
    lastDragX = event.clientX;
    lastDragTime = now;
    const distance = event.clientX - dragStartX;
    if (Math.abs(distance) > 4) suppressSpin = true;
    updatePosition(dragStartOffset - distance);
  };
  const endDrag = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!dragging() || event.pointerId !== activePointer) return;
    activePointer = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragBoosting) return;
    if (!suppressSpin) return;
    // A stale last movement must not fling the reel after the user has stopped.
    const velocity =
      event.type === "pointercancel" || performance.now() - lastDragTime > 100
        ? 0
        : dragVelocity;
    const projectedOffset = position + velocity * 260;
    const index = Math.round(projectedOffset / CARD_STEP);
    setSettling(true);
    discardPickedDish();
    animateTo(index * CARD_STEP, 520, finishSettle);
  };
  return (
    <main class="phone-shell">
      <section class="feature-screen crystal-screen">
        <header class="crystal-header">
          <button
            class="back-button"
            onClick={() => navigate("/")}
            aria-label={t("back")}
          >
            <Icon name="arrowLeft" size={24} />
          </button>
          <h1>Crystal Ball</h1>
          <button
            class={{
              "crystal-filter-button": true,
              active: selectedTags().length > 0,
            }}
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label={t("filterByTags")}
          >
            <Icon name="funnel" size={20} />
          </button>
          <button
            class="crystal-menu-button"
            type="button"
            onClick={openDishMenu}
            aria-label={t("yourDishes")}
          >
            <Icon name="menu" size={23} />
          </button>
        </header>
        <div class="crystal-content">
          <Show
            when={loading()}
            fallback={
              <Show when={messageVersion()} keyed>
                {() => (
                  <p class="crystal-instruction crystal-message">{message()}</p>
                )}
              </Show>
            }
          >
            <p class="crystal-instruction">{t("crystalLoading")}</p>
          </Show>
          <button
            class="crystal-spin-button"
            onClick={spin}
            disabled={settling() || !activeDishes().length}
            aria-label={loading() ? t("boostLabel") : t("spinLabel")}
          >
            {t("spin")}
          </button>
          <div
            class={{ "crystal-roulette": true, dragging: dragging() }}
            role="group"
            aria-label={loading() ? t("dragBoostLabel") : t("dragLabel")}
            aria-disabled={settling() || !activeDishes().length}
            onPointerDown={beginDrag}
            onPointerMove={drag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div class="selection-marker" aria-hidden="true" />
            <div
              class="crystal-card-row"
              style={{
                "--crystal-offset": `${renderedOffset()}px`,
              }}
            >
              <For each={choices()}>{(dish) => <DishCard dish={dish} />}</For>
            </div>
          </div>
          <Show when={discarded()} keyed>
            {(dish) => (
              <DishReceipt dish={dish} discarded initialY={discardedOffset()} />
            )}
          </Show>
          <Show when={picked()} keyed>
            {(dish) => (
              <DishReceipt dish={dish} onDiscard={discardPickedDish} />
            )}
          </Show>
          <Show when={!savedUser()}>
            <p class="crystal-login-note">{t("loginNote")}</p>
          </Show>
        </div>
      </section>
      <Show when={menuOpen()}>
        <div
          class="crystal-dialog-overlay"
          role="presentation"
          onClick={() => setMenuOpen(false)}
        >
          <section
            class="crystal-add-dialog crystal-dishes-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("yourDishes")}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              class="crystal-dialog-close"
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("close")}
            >
              <Icon name="x" size={20} />
            </button>
            <h2>{t("yourDishes")}</h2>
            <button
              class="primary-button crystal-add-dish-action"
              type="button"
              onClick={() => openDishForm()}
            >
              <Icon name="plus" size={17} /> {t("addDish")}
            </button>
            <Show
              when={ownedDishes().length}
              fallback={<p class="dish-manager-empty">{t("noCustomDishes")}</p>}
            >
              <div class="crystal-user-dishes">
                <For each={ownedDishes()}>
                  {(dish) => (
                    <article class="crystal-user-dish">
                      <span>
                        <DishVisual image={dish.image} class="dish-photo" />
                      </span>
                      <div>
                        <h3>{dish.name}</h3>
                        <p>{dish.calories} kcal</p>
                      </div>
                      <div class="crystal-dish-actions">
                        <button
                          type="button"
                          onClick={() => openDishForm(dish)}
                          aria-label={`${t("editDish")}: ${dish.name}`}
                        >
                          <Icon name="pencil" size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteMessage("");
                            setDeletingDish(dish);
                          }}
                          aria-label={`${t("removeDish")}: ${dish.name}`}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </section>
          <Show when={addOpen()}>
            <div
              class="crystal-dialog-overlay crystal-form-overlay"
              role="presentation"
              onClick={(event) => {
                event.stopPropagation();
                setAddOpen(false);
              }}
            >
              <section
                class="crystal-add-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={t("addDish")}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  class="crystal-dialog-close"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAddOpen(false);
                  }}
                  aria-label={t("close")}
                >
                  <Icon name="x" size={20} />
                </button>
                <h2>{editing() ? t("editDish") : t("addDish")}</h2>
                <form
                  class="compact-form dish-form"
                  onSubmit={(event) => void submitDish(event)}
                >
                  <input
                    name="name"
                    required
                    maxlength="100"
                    value={editing()?.name ?? ""}
                    placeholder={t("dishName")}
                  />
                  <div class="tag-input">
                    <input
                      name="category"
                      required={!tags().length}
                      maxlength="50"
                      value={tagDraft()}
                      onInput={(event) =>
                        setTagDraft(event.currentTarget.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder={t("category")}
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      aria-label={t("addTag")}
                    >
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                  <div class="preset-tags">
                    <For each={presetTagKeys}>
                      {(key) => {
                        const tag = t(key);
                        return (
                          <button
                            class={{ active: tags().includes(tag) }}
                            type="button"
                            onClick={() => toggleTag(tag)}
                          >
                            {tag}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                  <Show when={tags().length}>
                    <div class="dish-tags">
                      <For each={tags()}>
                        {(tag) => (
                          <button
                            type="button"
                            onClick={() => toggleTag(tag)}
                            aria-label={`${t("removeTag")}: ${tag}`}
                          >
                            <span>{tag}</span>
                            <Icon name="x" size={12} />
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="macro-inputs">
                    <input
                      name="calories"
                      required
                      type="number"
                      min="0"
                      value={editing()?.calories ?? ""}
                      placeholder="kcal"
                    />
                    <input
                      name="protein"
                      required
                      type="number"
                      min="0"
                      value={editing()?.protein ?? ""}
                      placeholder="Protein g"
                    />
                    <input
                      name="carbs"
                      required
                      type="number"
                      min="0"
                      value={editing()?.carbs ?? ""}
                      placeholder="Carbs g"
                    />
                    <input
                      name="fat"
                      required
                      type="number"
                      min="0"
                      value={editing()?.fat ?? ""}
                      placeholder="Fat g"
                    />
                    <input
                      name="sodium_mg"
                      required
                      type="number"
                      min="0"
                      value={editing()?.sodium_mg ?? ""}
                      placeholder="Sodium mg"
                    />
                  </div>
                  <div class="dish-image-input">
                    <label class="dish-image-upload">
                      <span>{t("dishImage")}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={chooseDishImage}
                      />
                    </label>
                    <Show when={dishImage()}>
                      <div class="dish-image-preview">
                        <DishVisual image={dishImage()} class="dish-photo" />
                        <button
                          type="button"
                          onClick={() => setDishImage("")}
                          aria-label={t("removeDishImage")}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    </Show>
                  </div>
                  <input
                    name="emoji"
                    maxlength="16"
                    value={
                      editing() && !isDishImage(editing()!.image)
                        ? editing()!.image
                        : ""
                    }
                    placeholder={t("emoji")}
                  />
                  <textarea
                    name="description"
                    maxlength="500"
                    value={editing()?.description ?? ""}
                    placeholder={t("description")}
                  />
                  <Show when={addMessage()}>
                    <p class="inline-notice">{addMessage()}</p>
                  </Show>
                  <div class="crystal-add-actions">
                    <button
                      class="text-button"
                      type="button"
                      onClick={() => setAddOpen(false)}
                    >
                      {t("cancel")}
                    </button>
                    <button class="primary-button" disabled={addBusy()}>
                      {addBusy()
                        ? t("saving")
                        : editing()
                          ? t("save")
                          : t("addDish")}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </Show>
          <Show when={dishCropOpen()}>
            <div
              class="crystal-dialog-overlay crystal-form-overlay"
              role="presentation"
              onClick={() => setDishCropOpen(false)}
            >
              <section
                class="crystal-add-dialog crop-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="crop-dish-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="crop-dish-title">{t("cropDishImage")}</h2>
                <div class="cropper-frame">
                  <img
                    ref={(element) => {
                      dishCropImage = element;
                    }}
                    src={dishCropSource()}
                    alt={t("cropDishImage")}
                  />
                </div>
                <div class="crop-actions">
                  <button
                    class="text-button"
                    type="button"
                    onClick={() => setDishCropOpen(false)}
                  >
                    {t("cancel")}
                  </button>
                  <button
                    class="primary-button"
                    type="button"
                    onClick={saveDishCrop}
                  >
                    {t("savePhoto")}
                  </button>
                </div>
              </section>
            </div>
          </Show>
          <Show when={deletingDish()} keyed>
            {(dish) => (
              <div
                class="crystal-dialog-overlay crystal-form-overlay"
                role="presentation"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!deleteBusy()) setDeletingDish();
                }}
              >
                <section
                  class="crystal-add-dialog crystal-delete-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="delete-dish-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    class="crystal-dialog-close"
                    type="button"
                    disabled={deleteBusy()}
                    onClick={() => setDeletingDish()}
                    aria-label={t("close")}
                  >
                    <Icon name="x" size={20} />
                  </button>
                  <h2 id="delete-dish-title">{t("deleteDishQuestion")}</h2>
                  <p>
                    {t("deleteDishCopy")} <b>{dish.name}</b>.
                  </p>
                  <Show when={deleteMessage()}>
                    <p class="inline-notice">{deleteMessage()}</p>
                  </Show>
                  <div class="crystal-add-actions">
                    <button
                      class="text-button"
                      type="button"
                      disabled={deleteBusy()}
                      onClick={() => setDeletingDish()}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      class="delete-confirm-button"
                      type="button"
                      disabled={deleteBusy()}
                      onClick={() => void confirmDeleteDish()}
                    >
                      {deleteBusy() ? t("deleting") : t("removeDish")}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <Show when={filterOpen()}>
        <div
          class="crystal-dialog-overlay"
          role="presentation"
          onClick={() => setFilterOpen(false)}
        >
          <section
            class="crystal-add-dialog crystal-filter-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-tags-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              class="crystal-dialog-close"
              type="button"
              onClick={() => setFilterOpen(false)}
              aria-label={t("close")}
            >
              <Icon name="x" size={20} />
            </button>
            <h2 id="filter-tags-title">{t("filterByTags")}</h2>
            <p>{t("filterTagsCopy")}</p>
            <div class="preset-tags crystal-filter-tags">
              <For each={availableTags()}>
                {(tag) => (
                  <button
                    class={{ active: selectedTags().includes(tag) }}
                    type="button"
                    onClick={() => toggleFilterTag(tag)}
                  >
                    {tagLabel(tag)}
                  </button>
                )}
              </For>
            </div>
            <Show when={!activeDishes().length}>
              <p class="inline-notice">{t("noMatchingDishes")}</p>
            </Show>
            <div class="crystal-add-actions">
              <button class="text-button" type="button" onClick={clearFilters}>
                {t("clearFilters")}
              </button>
              <button
                class="primary-button"
                type="button"
                onClick={() => setFilterOpen(false)}
              >
                {t("close")}
              </button>
            </div>
          </section>
        </div>
      </Show>
      <Show when={accountOpen()}>
        <AccountDialog
          user={user()}
          onUserChange={setUser}
          onClose={() => setAccountOpen(false)}
        />
      </Show>
    </main>
  );
}
