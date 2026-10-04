import { captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CARD_STEP, modulo } from "../lib/carousel-motion";
import CrystalBall from "../routes/crystal";

vi.mock("@solidjs/router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/api")>();
  return {
    ...original,
    fetchDishes: async () =>
      Array.from({ length: 3 }, (_, index) => ({
        id: `dish-${index}`,
        name: `Dish ${index}`,
        category: "test",
        calories: 100,
        protein: 10,
        carbs: 10,
        fat: 5,
        sodium_mg: 100,
        image: "🍽️",
        description: "",
      })),
  };
});

describe("crystal carousel interactions", () => {
  let now = 0;
  let nextFrame = 0;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    now = 0;
    frames = new Map();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const advance = (milliseconds: number) => {
    now += milliseconds;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
    flush();
  };

  const mount = async () => {
    const view = render(() => <CrystalBall />);
    await waitFor(() =>
      expect(
        view.container.querySelectorAll(".crystal-dish-card"),
      ).toHaveLength(21),
    );
    const reel =
      view.container.querySelector<HTMLElement>(".crystal-card-row")!;
    const roulette = view.getByRole("group");
    roulette.setPointerCapture = vi.fn();
    roulette.hasPointerCapture = () => true;
    roulette.releasePointerCapture = vi.fn();
    const position = () =>
      parseFloat(reel.style.getPropertyValue("--crystal-offset"));
    const pointer = (type: string, x: number, id = 1) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        button: 0,
      });
      Object.defineProperty(event, "pointerId", { value: id });
      fireEvent(roulette, event);
      flush();
    };
    return {
      ...view,
      reel,
      position,
      pointer,
      spin: view.container.querySelector<HTMLButtonElement>(
        ".crystal-spin-button",
      )!,
    };
  };

  test("drag inertia crosses the loop seam forward, then spinning keeps the same reel", async () => {
    const view = await mount();
    const cards = [...view.reel.children];
    const { artifact } = await captureArtifact(
      () => {
        view.pointer("pointerdown", 300);
        advance(16);
        view.pointer("pointermove", -200);
        const released = view.position();
        view.pointer("pointerup", -200);
        advance(16);
        expect(modulo(view.position() - released, 3 * CARD_STEP)).toBeLessThan(
          (3 * CARD_STEP) / 2,
        );
        advance(520);
        const beforeSpin = view.position();
        fireEvent.click(view.spin);
        flush();
        expect(view.position()).toBe(beforeSpin);
        advance(16);
        expect(
          modulo(view.position() - beforeSpin, 3 * CARD_STEP),
        ).toBeGreaterThan(0);
        expect([...view.reel.children]).toEqual(cards);
        advance(3200);
      },
      { scenario: "crystal-drag-spin" },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(artifact).toStayWithinRerunBudget(50, {
      scope: /carouselVirtualWindow/,
    });
    expect(
      view.container.querySelector(
        ".crystal-result:not(.crystal-result-discarded)",
      ),
    ).not.toBeNull();
    const centered =
      Math.round(view.position() / CARD_STEP) -
      Math.round(
        parseFloat(
          view.reel.style.getPropertyValue("--crystal-window-offset"),
        ) / CARD_STEP,
      );
    expect(
      view.container.querySelector(
        ".crystal-result:not(.crystal-result-discarded) h2",
      )?.textContent,
    ).toBe(view.reel.children[centered].querySelector("h2")?.textContent);
  });

  test("loading text animates on entry without restarting on boosts", async () => {
    const view = await mount();
    const hint = view.container.querySelector(".crystal-instruction");
    fireEvent.click(view.spin);
    flush();
    const loading = view.container.querySelector(".crystal-instruction");
    expect(loading).not.toBe(hint);
    expect(loading?.classList.contains("crystal-message")).toBe(true);
    advance(16);
    fireEvent.click(view.spin);
    flush();
    expect(view.container.querySelector(".crystal-instruction")).toBe(loading);
    advance(3000);
    expect(view.container.querySelector(".crystal-instruction")).not.toBe(
      loading,
    );
  });

  test("boost clicks and boost drags do not interrupt the visible trajectory", async () => {
    const view = await mount();
    fireEvent.click(view.spin);
    advance(16);
    const beforeBoost = view.position();
    fireEvent.click(view.spin);
    flush();
    expect(view.position()).toBeCloseTo(beforeBoost);
    view.pointer("pointerdown", 100);
    advance(16);
    const beforeDrag = view.position();
    view.pointer("pointermove", 140);
    expect(view.position()).toBeCloseTo(beforeDrag);
    advance(16);
    expect(modulo(view.position() - beforeDrag, 3 * CARD_STEP)).toBeGreaterThan(
      0,
    );
    // If the spin finishes while held, this gesture must not turn into a
    // manual drag using the obsolete pointer-down offset.
    advance(4000);
    const completed = view.position();
    view.pointer("pointermove", 200);
    view.pointer("pointerup", 200);
    expect(view.position()).toBe(completed);
    expect(frames.size).toBe(0);
  });

  test("a paused drag has no stale fling and unmount cancels pending animation", async () => {
    const view = await mount();
    view.pointer("pointerdown", 200);
    advance(16);
    view.pointer("pointermove", 100);
    advance(200);
    view.pointer("pointerup", 100);
    advance(520);
    expect(modulo(view.position(), 3 * CARD_STEP)).toBe(CARD_STEP);
    fireEvent.click(view.spin);
    expect(frames.size).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
  });

  test.each(["button", "drag"])(
    "%s adds momentum while a previous drag is still settling",
    async (input) => {
      const view = await mount();
      const { artifact } = await captureArtifact(
        () => {
          view.pointer("pointerdown", 300);
          advance(16);
          view.pointer("pointermove", 220);
          view.pointer("pointerup", 220);
          advance(16);
          expect(view.spin.disabled).toBe(false);
          const before = view.position();
          if (input === "button") fireEvent.click(view.spin);
          else {
            view.pointer("pointerdown", 220);
            view.pointer("pointermove", 124);
            view.pointer("pointerup", 124);
          }
          flush();
          expect(view.position()).toBeCloseTo(before);
          advance(600);
          expect(frames.size).toBe(1);
          expect(
            view.container.querySelector(
              ".crystal-result:not(.crystal-result-discarded)",
            ),
          ).toBeNull();
          advance(2400);
          expect(frames.size).toBe(0);
        },
        { scenario: `crystal-settling-${input}-boost` },
      );
      expect(artifact).toHaveNoDiagnostics();
      expect(artifact).toStayWithinRerunBudget(50, {
        scope: /carouselVirtualWindow/,
      });
    },
  );

  test.each([0, 12, 192])(
    "boost adds speed proportional to swipe distance (%s px; zero means button)",
    async (distance) => {
      const view = await mount();
      fireEvent.click(view.spin);
      advance(100);
      const previous = view.position();
      advance(1);
      const before = view.position();
      const speed = modulo(before - previous, 3 * CARD_STEP);
      if (distance === 0) fireEvent.click(view.spin);
      else {
        view.pointer("pointerdown", 300);
        view.pointer("pointermove", 300 - distance);
        view.pointer("pointerup", 300 - distance);
      }
      flush();
      expect(view.position()).toBeCloseTo(before);
      advance(1);
      const boostedSpeed = modulo(view.position() - before, 3 * CARD_STEP);
      expect(boostedSpeed - speed).toBeGreaterThan(
        3.4 * (distance ? distance / 96 : 1),
      );
    },
  );

  test("changing filters cancels an in-flight spin without a late receipt", async () => {
    const view = await mount();
    fireEvent.click(view.spin);
    advance(16);
    fireEvent.click(view.container.querySelector(".crystal-filter-button")!);
    flush();
    const tag = view.container.querySelector<HTMLButtonElement>(
      ".crystal-filter-tags button",
    )!;
    fireEvent.click(tag);
    flush();
    expect(frames.size).toBe(0);
    expect(modulo(view.position(), 3 * CARD_STEP)).toBe(0);
    advance(4000);
    expect(view.container.querySelector(".crystal-result")).toBeNull();
  });
});
