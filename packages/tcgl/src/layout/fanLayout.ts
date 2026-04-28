import { DEFAULT_CARD_W } from "../constants/dimensions";
import type { Vec3 } from "../types";

/**
 * @see https://github.com/WaelYasmina/ecard — linear X spread, slight Y/Z “bowl”, and roll
 * on Z (fan in the hand plane) while the card mesh lies flat with -π/2 on X inside {@link Card}.
 */
export type FanStyle = "ecard" | "arc";

export type FanOptions = {
  count: number;
  /** Half-width in world X for `ecard` (full spread ≈ `2 * xSpreadFactor * radius` when not set). */
  radius?: number;
  /**
   * `arc` (radians) only for `style: "arc"`.
   * @default 0.85
   */
  arc?: number;
  y?: number;
  /** @default "ecard" */
  style?: FanStyle;
  /**
   * Max |Z| roll in radians (in-plane fan). Lower = a flatter “row”.
   * @default 0.06
   */
  maxRollZ?: number;
  /**
   * Per-index Y arch (quadratic in index). @default 0 (even height; coplanar with the mat in Y).
   */
  yArch?: number;
  /**
   * Z “bowl” so the center can sit a bit more forward. Lower = flatter in depth.
   * @default 0.008
   */
  zBowl?: number;
  /**
   * Base Z in hand space (larger = toward player in our typical zone setup).
   * @default 0.22
   */
  zHand?: number;
  /**
   * Minimum world-space distance between **card centers** along the X spread (ecard), so
   * neighbors with default card width do not sit on top of each other. Defaults to
   * slightly more than `DEFAULT_CARD_W` to leave a sliver of gap; raise if you use large `cardScale`.
   * @default ~1.18
   */
  minCenterSpacing?: number;
  /**
   * Mirror the fan horizontally (negate X and roll): bottom-hand vs top/opponent HUD symmetry.
   */
  invertFanX?: boolean;
};

/** With zone `y=0` on the playmat, use 0 here — `Card` applies `tableClearance` so faces sit above the mat. */
const DEFAULT_Y = 0;
const DEFAULT_Z = 0.22;

/**
 * ecard `myCardsPositions` / `myCardsRotations` pattern, scaled for TCGL zone units.
 * Rotation is [0,0, rollZ] on the per-card group; `Card` applies lay-flat [-π/2,0,0] internally.
 */
function cardFanEcard(i: number, n: number, opts: FanOptions): { position: Vec3; rotation: Vec3 } {
  const y0 = opts.y ?? DEFAULT_Y;
  const z0 = opts.zHand ?? DEFAULT_Z;
  const maxRollZ = opts.maxRollZ ?? 0.06;
  const yArch = opts.yArch ?? 0;
  const zBowl = opts.zBowl ?? 0.008;
  // Ecard’s tiny absolute spread (radius*0.42) is for small tutorial meshes; our cards are ~DEFAULT_CARD_W
  // world units wide — we must not pack centers closer than that or faces overlap in X.
  const minGap = opts.minCenterSpacing ?? DEFAULT_CARD_W * 1.05 + 0.04;
  const fromRadius = (opts.radius ?? 1.2) * 0.42;
  const minSpan = n <= 1 ? 0 : (n - 1) * minGap;
  const spreadX = Math.max(minSpan, fromRadius);
  if (n <= 1) {
    return { position: [0, y0, z0], rotation: [0, 0, 0] };
  }
  const u = i / (n - 1);
  const t = 2 * u - 1;
  let x = (-spreadX / 2) * t;
  const y = y0 + yArch * t * t;
  const z = z0 - zBowl * (1 - t * t);
  let rollZ = t * maxRollZ;
  if (opts.invertFanX) {
    x = -x;
    rollZ = -rollZ;
  }
  return { position: [x, y, z], rotation: [0, 0, rollZ] };
}

/**
 * Trigonometric fan on a small arc (older TCGL default).
 */
function cardFanArc(i: number, n: number, opts: FanOptions): { position: Vec3; rotation: Vec3 } {
  const arc = opts.arc ?? 0.85;
  const y = opts.y ?? DEFAULT_Y;
  const rLine = opts.radius ?? 1.2;
  const minGap = opts.minCenterSpacing ?? DEFAULT_CARD_W * 1.05 + 0.04;
  if (n <= 1) {
    return { position: [0, y, 0.2], rotation: [0, 0, 0] };
  }
  const t0 = -arc / 2;
  const t1 = arc / 2;
  const u = n === 1 ? 0.5 : i / (n - 1);
  const a = t0 + (t1 - t0) * u;
  const dAngle = arc / (n - 1);
  const rX0 = rLine * 0.48;
  const rX = Math.max(
    rX0,
    minGap / (2 * Math.max(1e-4, Math.sin(dAngle / 2)))
  );
  let x = Math.sin(a) * rX;
  const z = -Math.cos(a) * rLine * 0.1 + DEFAULT_Z;
  let ry = a * 0.22;
  if (opts.invertFanX) {
    x = -x;
    ry = -ry;
  }
  return {
    position: [x, y, z],
    rotation: [0, ry, 0],
  };
}

/**
 * Produces per-index transform for a hand of cards. Default `ecard` matches
 * the [WaelYasmina/ecard](https://github.com/WaelYasmina/ecard) tutorial hand layout; use
 * `style: "arc"` for the previous circular fan.
 */
export function cardFanLayout(
  i: number,
  opts: FanOptions
): { position: Vec3; rotation: Vec3 } {
  const n = Math.max(1, opts.count);
  const style = opts.style ?? "ecard";
  if (style === "arc") {
    return cardFanArc(i, n, opts);
  }
  return cardFanEcard(i, n, opts);
}
