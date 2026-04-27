import type { Vec3 } from "../types";

export function cardStackIndex(i: number, yStep = 0.02): Vec3 {
  return [0, i * yStep, i * 0.001];
}

/** Loose overlap — small deterministic jitter for a “discarded” feel. */
export function cardPileIndex(i: number, yStep = 0.018): { position: Vec3; rotation: Vec3 } {
  const a = (i * 0.7) % 0.2;
  const b = (i * 0.3) % 0.12;
  return {
    position: [a * 0.4 - 0.04, i * yStep, b * 0.4 - 0.02],
    rotation: [0, 0, (a - b) * 0.15],
  };
}

export function cardGridIndex(
  i: number,
  opts: { cols: number; colGap: number; rowGap: number }
): { position: Vec3; rotation: Vec3 } {
  const { cols, colGap, rowGap } = opts;
  const c = i % cols;
  const r = Math.floor(i / cols);
  const x = c * colGap - ((cols - 1) * colGap) / 2;
  const z = r * rowGap;
  return { position: [x, 0, z], rotation: [0, 0, 0] };
}
