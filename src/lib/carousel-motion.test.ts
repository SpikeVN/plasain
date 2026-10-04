import { describe, expect, test } from "vitest";
import {
  CARD_STEP,
  forwardTarget,
  modulo,
  reelOffset,
  sampleMotion,
} from "./carousel-motion";

describe("continuous carousel motion", () => {
  test("spins always advance from any drag position to the chosen card", () => {
    for (const count of [1, 2, 7, 30]) {
      for (const from of [-100000, -83.5, 0, 999999.75]) {
        for (let winner = 0; winner < count; winner++) {
          const to = forwardTarget(from, winner, count);
          expect(to - from).toBeGreaterThanOrEqual(22 * CARD_STEP);
          expect(modulo(to / CARD_STEP, count)).toBeCloseTo(winner);
          let previous = from;
          for (let time = 0; time <= 3200; time += 16) {
            const position = sampleMotion(
              { from, to, started: 0, duration: 3200 },
              time,
            );
            expect(position).toBeGreaterThanOrEqual(previous);
            previous = position;
          }
        }
      }
    }
  });

  test("loop rebasing preserves the same cards for positive and negative positions", () => {
    for (const count of [1, 2, 30]) {
      const cycle = count * CARD_STEP;
      for (const position of [-cycle - 1, -1, 0, cycle - 1, cycle, cycle + 1]) {
        const rendered = reelOffset(position, count);
        expect(rendered).toBeGreaterThanOrEqual(cycle * 4);
        expect(rendered).toBeLessThan(cycle * 5);
        expect(modulo(rendered, cycle)).toBe(modulo(position, cycle));
      }
    }
  });

  test("boosting continues from the sampled position, even across many loops", () => {
    let motion = {
      from: -70,
      to: forwardTarget(-70, 1, 2),
      started: 0,
      duration: 3200,
    };
    for (let boost = 1; boost <= 100; boost++) {
      const now = boost * 32;
      const visible = sampleMotion(motion, now);
      motion = {
        from: visible,
        to: motion.to + 8 * CARD_STEP,
        started: now,
        duration: Math.max(1100, motion.duration - 400),
      };
      expect(sampleMotion(motion, now)).toBe(visible);
      expect(sampleMotion(motion, now + 16)).toBeGreaterThan(visible);
    }
    expect(sampleMotion(motion, motion.started + motion.duration)).toBe(
      motion.to,
    );
  });

  test("settling follows the unwrapped fling direction through a loop seam", () => {
    for (const direction of [-1, 1]) {
      const from = 2 * CARD_STEP + direction;
      const to = Math.round((from + direction * 900) / CARD_STEP) * CARD_STEP;
      const middle = sampleMotion({ from, to, started: 0, duration: 520 }, 260);
      expect((middle - from) * direction).toBeGreaterThan(0);
      expect((to - middle) * direction).toBeGreaterThan(0);
    }
  });
});
