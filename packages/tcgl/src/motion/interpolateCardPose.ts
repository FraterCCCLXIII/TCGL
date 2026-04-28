import { Euler, Quaternion } from "three";
import type { CardSpatialPose } from "./cardMotionTypes";

const ZERO: [number, number, number] = [0, 0, 0];

/** Matches {@link Card}'s wrapper euler convention (`rotation` prop). */
const EULER_ORDER = "XYZ" as const;

const _eFrom = new Euler();
const _eTo = new Euler();
const _qFrom = new Quaternion();
const _qTo = new Quaternion();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Linear interpolation from → to with optional vertical arc:
 * adds `arcLiftMax * sin(π·t)` to **world Y** so the chord bows upward (deck→hand, discard piles, etc.).
 *
 * **Rotation:** Euler XYZ components are **not** lerped independently — that twists incorrectly between
 * HUD fan poses (mostly roll / camera-tilted screen cards) and table lay-flat poses (near identity on
 * the wrapper). Uses quaternion **spherical interpolation** so yaw (and full orientation) follows
 * the shortest arc between endpoints.
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

  _eFrom.set(rf[0]!, rf[1]!, rf[2]!, EULER_ORDER);
  _eTo.set(rt[0]!, rt[1]!, rt[2]!, EULER_ORDER);
  _qFrom.setFromEuler(_eFrom);
  _qTo.setFromEuler(_eTo);
  _qFrom.slerp(_qTo, u);
  _eFrom.setFromQuaternion(_qFrom, EULER_ORDER);

  return {
    position: [
      lerp(from.position[0]!, to.position[0]!, u),
      chordY + arc,
      lerp(from.position[2]!, to.position[2]!, u),
    ],
    rotation: [_eFrom.x, _eFrom.y, _eFrom.z],
    scale: lerp(sf, st, u),
  };
}
