import type { GameState, ZoneId } from "../types/state";

export function cloneState(s: GameState): GameState {
  const zc: Record<ZoneId, string[]> = {};
  for (const k of Object.keys(s.zoneContents)) {
    zc[k] = [...(s.zoneContents[k] ?? [])];
  }
  return {
    ...s,
    players: [...s.players],
    zoneContents: zc,
    cards: { ...s.cards },
    stack: s.stack.map((o) => ({ ...o })),
  };
}

export function getZone(
  s: GameState,
  z: string,
  create = false
): string[] {
  if (create && s.zoneContents[z] == null) {
    s.zoneContents[z] = [];
  }
  return s.zoneContents[z] ?? [];
}
