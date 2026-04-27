import { DEFAULT_CARD_H, DEFAULT_CARD_W } from "../constants/dimensions";

/**
 * World-space corner radius matching {@link createRoundedCardAlphaMap} (same 512px reference width).
 */
export function getCardRimWorldRadius(cornerRadius: number): number {
  if (cornerRadius <= 0) {
    return 0;
  }
  const w = DEFAULT_CARD_W;
  const h = DEFAULT_CARD_H;
  const wpx = 512;
  const hpx = Math.max(32, Math.round((h / w) * wpx));
  const r = Math.min(
    wpx * Math.min(0.45, Math.max(0, cornerRadius)),
    hpx * 0.45,
    wpx * 0.45
  );
  return (r / wpx) * w;
}
