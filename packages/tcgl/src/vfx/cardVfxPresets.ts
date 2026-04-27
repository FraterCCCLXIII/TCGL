import { Color, MathUtils } from "three";

/** Visual burst kinds for `CardVfx` — not game rules, presentation only. */
export type CardVfxKind = "damage" | "heal" | "buff" | "debuff" | "generic";

export type CardVfxPreset = {
  particleCount: number;
  /** Seconds until fade-out completes. */
  duration: number;
  /** `PointsMaterial` point size. */
  pointSize: number;
  /** In face-aligned local space: +Y = normal from the table card face. */
  gravity: [number, number, number];
  /** Per-frame velocity multiplier (0..1, drag). */
  drag: number;
  /** true = additively blend spark-like particles. */
  additive: boolean;
  /** Lerp to white at 0, full preset color at 1. */
  colorGain: number;
  /** How strongly particle tint varies. */
  colorJitter: number;
};

const clamp01 = (t: number) => MathUtils.clamp(t, 0, 1);

const burstDirXZ = (out: { x: number; y: number; z: number }, speed: number) => {
  const a = Math.random() * Math.PI * 2;
  const c = (Math.random() * 0.4 + 0.6) * speed;
  out.x = Math.cos(a) * c;
  out.z = Math.sin(a) * c;
  out.y = (Math.random() - 0.3) * speed * 0.35;
};

export const cardVfxPresets: Record<CardVfxKind, CardVfxPreset> = {
  damage: {
    particleCount: 56,
    duration: 0.72,
    pointSize: 0.05,
    gravity: [0, -0.28, 0],
    drag: 0.985,
    additive: true,
    colorGain: 1,
    colorJitter: 0.22,
  },
  heal: {
    particleCount: 48,
    duration: 0.88,
    pointSize: 0.05,
    gravity: [0, 0.18, 0],
    drag: 0.992,
    additive: true,
    colorGain: 1,
    colorJitter: 0.18,
  },
  buff: {
    particleCount: 44,
    duration: 0.78,
    pointSize: 0.05,
    gravity: [0, 0.04, 0],
    drag: 0.988,
    additive: true,
    colorGain: 1,
    colorJitter: 0.2,
  },
  debuff: {
    particleCount: 50,
    duration: 0.82,
    pointSize: 0.05,
    gravity: [0, -0.22, 0],
    drag: 0.99,
    additive: true,
    colorGain: 1,
    colorJitter: 0.25,
  },
  generic: {
    particleCount: 36,
    duration: 0.58,
    pointSize: 0.044,
    gravity: [0, 0, 0],
    drag: 0.99,
    additive: true,
    colorGain: 0.9,
    colorJitter: 0.12,
  },
};

const baseForKind = (kind: CardVfxKind) => {
  const c = new Color();
  switch (kind) {
    case "damage":
      c.setHSL(0.02 + Math.random() * 0.04, 0.95, 0.55);
      return c;
    case "heal":
      c.setHSL(0.32 + Math.random() * 0.05, 0.75, 0.58);
      return c;
    case "buff":
      c.setHSL(0.12 + Math.random() * 0.05, 0.9, 0.6);
      return c;
    case "debuff":
      c.setHSL(0.78 + Math.random() * 0.04, 0.75, 0.5);
      return c;
    default:
      c.setHSL(0, 0, 0.92);
      return c;
  }
};

/**
 * Fills `pos`, `vel`, `col` (length `n * 3` each) for a one-shot burst. Call when `trigger` changes.
 */
export function seedCardVfxBurst(
  kind: CardVfxKind,
  n: number,
  pos: Float32Array,
  vel: Float32Array,
  col: Float32Array,
  preset: CardVfxPreset
) {
  const xyNoise = 0.18 + Math.random() * 0.1;
  const tmpV = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    // Start in a small cloud just above the card plane (+Y in face-aligned space).
    pos[i3] = (Math.random() - 0.5) * 0.35;
    pos[i3 + 1] = 0.02 + Math.random() * 0.1;
    pos[i3 + 2] = (Math.random() - 0.5) * 0.5;

    const base = baseForKind(kind);
    if (kind === "generic") {
      base.offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    }

    const r = 1 - preset.colorJitter + Math.random() * 2 * preset.colorJitter;
    const gch = 1 - preset.colorJitter + Math.random() * 2 * preset.colorJitter;
    const b = 1 - preset.colorJitter + Math.random() * 2 * preset.colorJitter;
    const mix = preset.colorGain;
    col[i3] = base.r * r * mix + (1 - mix);
    col[i3 + 1] = base.g * gch * mix + (1 - mix);
    col[i3 + 2] = base.b * b * mix + (1 - mix);

    const sBase = 0.85 + Math.random() * 0.55;

    switch (kind) {
      case "damage": {
        burstDirXZ(tmpV, 1.6 * sBase);
        tmpV.y = (Math.random() - 0.5) * 0.5 * sBase;
        break;
      }
      case "heal": {
        burstDirXZ(tmpV, 0.55 * sBase);
        tmpV.y = 0.9 * sBase + Math.random() * 0.5;
        break;
      }
      case "buff": {
        const t = (i / n) * Math.PI * 2;
        const w = 0.55 + Math.random() * 0.2;
        tmpV.x = -Math.sin(t) * w * 1.4 * sBase;
        tmpV.z = Math.cos(t) * w * 1.3 * sBase;
        tmpV.y = 0.4 * sBase + Math.random() * 0.35;
        break;
      }
      case "debuff": {
        burstDirXZ(tmpV, 0.5 * sBase);
        tmpV.y = -0.35 * sBase - Math.random() * 0.2;
        break;
      }
      default: {
        burstDirXZ(tmpV, 1.0 * sBase);
        tmpV.y = (Math.random() - 0.5) * 0.4 * sBase;
        break;
      }
    }

    if (xyNoise > 0) {
      tmpV.x += (Math.random() - 0.5) * xyNoise;
      tmpV.z += (Math.random() - 0.5) * xyNoise;
    }

    vel[i3] = tmpV.x;
    vel[i3 + 1] = tmpV.y;
    vel[i3 + 2] = tmpV.z;
  }
}

/**
 * Fades 0..1 for material opacity. Ease out so the burst decelerates visually.
 */
export function cardVfxLifeAlpha(elapsed: number, duration: number) {
  if (duration <= 0) {
    return 0;
  }
  return 1 - clamp01(elapsed / duration) ** 1.3;
}
