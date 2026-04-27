import { CanvasTexture, LinearFilter, SRGBColorSpace, Texture } from "three";

type Opts = {
  width: number;
  height: number;
  /** 0..1, relative to the shorter side (e.g. 0.06 for ~6% corner radius) */
  cornerRadius: number;
  resolution: number;
};

/**
 * Baked alpha / mask with an anti-aliased rounded rectangle — use with
 * `alphaMap` + `alphaTest` (or `transparent`) to avoid sharp quads.
 */
export function createRoundedCardAlphaMap(opts: Opts): Texture {
  const wpx = Math.max(32, Math.round(opts.resolution));
  const hpx = Math.max(32, Math.round((opts.height / opts.width) * wpx));
  const canvas = document.createElement("canvas");
  canvas.width = wpx;
  canvas.height = hpx;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context unavailable");
  }
  ctx.clearRect(0, 0, wpx, hpx);
  // cornerRadius: fraction of card width in world, same fraction in texture pixels
  const r = Math.min(
    wpx * Math.min(0.45, Math.max(0, opts.cornerRadius)),
    hpx * 0.45,
    wpx * 0.45
  );
  const pad = 1;
  ctx.fillStyle = "#ffffff";
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(pad, pad, wpx - 2 * pad, hpx - 2 * pad, r);
    ctx.fill();
  } else {
    roundRectPath(ctx, pad, pad, wpx - 2 * pad, hpx - 2 * pad, r);
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
