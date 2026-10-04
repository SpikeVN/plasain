export const CARD_STEP = 168;

export const modulo = (value: number, size: number) =>
  ((value % size) + size) % size;

// Logical positions never wrap. Only the rendered copy changes, without a
// transition, so crossing the loop seam cannot reverse an animation.
export function reelOffset(position: number, count: number) {
  const cycle = count * CARD_STEP;
  return cycle ? cycle * 4 + modulo(position, cycle) : 0;
}

export function forwardTarget(
  position: number,
  winner: number,
  count: number,
  minimumCards = 22,
) {
  const minimum = position + minimumCards * CARD_STEP;
  const cycle = count * CARD_STEP;
  return minimum + modulo(winner * CARD_STEP - minimum, cycle);
}

export interface Motion {
  from: number;
  to: number;
  started: number;
  duration: number;
}

export function sampleMotion(motion: Motion, now: number) {
  const progress = Math.max(
    0,
    Math.min(1, (now - motion.started) / motion.duration),
  );
  return motion.from + (motion.to - motion.from) * (1 - (1 - progress) ** 3);
}
