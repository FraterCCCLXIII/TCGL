import type { CardSpatialPose } from "./cardMotionTypes";

const ZERO: [number, number, number] = [0, 0, 0];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Linear interpolation from → to with optional vertical arc:
 * adds `arcLiftMax * sin(π·t)` to **world Y** so the chord bows upward (deck→hand, discard piles, etc.).
 */
export function interpolateCardPose(
  from: CardSpatialPose,
  to: CardSpatialPose,
  t: number,
  arcLiftMax = 0
): CardSpatialPose {
  const u = Math.min(1, Math.max(0, t));
  const rf = from.rotation ?? ZERO;
  const rt = to.rotation ?? ZERO;
  const sf = from.scale ?? 1;
  const st = to.scale ?? 1;
  const chordY = lerp(from.position[1]!, to.position[1]!, u);
  const arc = arcLiftMax > 0 ? arcLiftMax * Math.sin(Math.PI * u) : 0;

  return {
    position: [
      lerp(from.position[0]!, to.position[0]!, u),
      chordY + arc,
      lerp(from.position[2]!, to.position[2]!, u),
    ],
    rotation: [
      lerp(rf[0]!, rt[0]!, u),
      lerp(rf[1]!, rt[1]!, u),
      lerp(rf[2]!, rt[2]!, u),
    ],
    scale: lerp(sf, st, u),
  };
}
