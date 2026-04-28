/** World units — default playing-card size (~63×88mm-style ratio, readable on table cams). */
export const DEFAULT_CARD_W = 1.12;
export const DEFAULT_CARD_H = 1.56;
/** Matches {@link Card} default `tableClearance` — imperative strip snaps use the same value. */
export const DEFAULT_CARD_TABLE_CLEARANCE_Y = 0.06;
/**
 * Viewport-hand (`screenOverlay`) cards sit in a tight fan. Ghosted cards are semi-transparent, but
 * raycasts still hit the closest surface — often an opaque neighbor. Nudge local +Z slightly so
 * this card’s quads win picks (right-click menu, taps).
 */
export const SCREEN_OVERLAY_GHOST_PICK_Z_NUDGE = 0.06;
