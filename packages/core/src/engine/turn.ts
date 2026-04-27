import { TURN_PHASE_ORDER } from "../types/turn";
import type { GameState, PlayerId } from "../types/state";
import type { StepEntered, TurnAdvanced, TurnBegan } from "../types/events";
import { cloneState } from "./cloneState";

function indexOfPlayer(s: GameState, p: PlayerId): number {
  return s.players.indexOf(p);
}

function nextPlayer(s: GameState, p: PlayerId): PlayerId {
  const i = indexOfPlayer(s, p);
  const n = s.players.length;
  return s.players[(i + 1) % n] ?? p;
}

/** Advance to next `GamePhase` in order; if past `ending`, rotate active player. */
export function applyAdvanceStep(
  s: GameState
): { state: GameState; events: (StepEntered | TurnAdvanced | TurnBegan)[] } {
  const st = cloneState(s);
  const idx = TURN_PHASE_ORDER.indexOf(st.turnPhase);
  const nextIdx = idx < 0 ? 0 : idx + 1;
  const out: (StepEntered | TurnAdvanced | TurnBegan)[] = [];

  if (nextIdx < TURN_PHASE_ORDER.length) {
    st.turnPhase = TURN_PHASE_ORDER[nextIdx]!;
    st.turnStep = "pre";
    out.push({ type: "STEP_ENTERED", step: st.turnStep, phase: st.turnPhase });
    return { state: st, events: out };
  }

  // Finished `ending` — next player's turn, beginning phase.
  const previous = st.activePlayer;
  const nplayer = nextPlayer(st, st.activePlayer);
  st.activePlayer = nplayer;
  st.turnPhase = "beginning";
  st.turnStep = "pre";
  st.priorityPlayer = nplayer;
  st.priorityPassCount = 0;
  st.stack = [];
  st.turnNumber += 1;
  out.push({
    type: "TURN_ADVANCED",
    previousPlayer: previous,
    nextPlayer: nplayer,
    turnNumber: st.turnNumber,
  });
  out.push({ type: "TURN_BEGAN", player: nplayer, turnNumber: st.turnNumber });
  out.push({ type: "STEP_ENTERED", step: st.turnStep, phase: st.turnPhase });
  return { state: st, events: out };
}

/** Hard end turn: jump to next player, beginning, clear stack, reset priority. */
export function applyEndTurn(
  s: GameState,
  from: PlayerId
): { state: GameState; events: (StepEntered | TurnAdvanced | TurnBegan)[] } | "not_active" {
  if (s.activePlayer !== from) {
    return "not_active";
  }
  const st = cloneState(s);
  const previous = st.activePlayer;
  const nplayer = nextPlayer(st, st.activePlayer);
  st.activePlayer = nplayer;
  st.turnPhase = "beginning";
  st.turnStep = "pre";
  st.stack = [];
  st.priorityPlayer = nplayer;
  st.priorityPassCount = 0;
  st.turnNumber += 1;
  const events: (StepEntered | TurnAdvanced | TurnBegan)[] = [
    {
      type: "TURN_ADVANCED",
      previousPlayer: previous,
      nextPlayer: nplayer,
      turnNumber: st.turnNumber,
    },
    { type: "TURN_BEGAN", player: nplayer, turnNumber: st.turnNumber },
    { type: "STEP_ENTERED", step: st.turnStep, phase: st.turnPhase },
  ];
  return { state: st, events };
}

export { nextPlayer, indexOfPlayer };
