import type { GamePhase, TurnStep } from "./turn";

/**
 * **Facts** emitted by the engine after a state transition. The UI may animate; it must not invent
 * rules outcomes that are not described here.
 */
export type GameEvent =
  | CardMoved
  | ZoneReordered
  | TurnAdvanced
  | StepEntered
  | TurnBegan
  | PriorityGiven
  | StackObjectPushed
  | StackObjectResolved
  | LogLine;

export type CardMoved = {
  type: "CARD_MOVED";
  cardId: string;
  fromZone: string;
  toZone: string;
  toIndex: number;
};

export type ZoneReordered = {
  type: "ZONE_REORDERED";
  zoneId: string;
  cardId: string;
  fromIndex: number;
  toIndex: number;
};

export type TurnAdvanced = {
  type: "TURN_ADVANCED";
  previousPlayer: string;
  nextPlayer: string;
  turnNumber: number;
};

export type StepEntered = {
  type: "STEP_ENTERED";
  step: TurnStep;
  phase: GamePhase;
};

export type TurnBegan = {
  type: "TURN_BEGAN";
  player: string;
  turnNumber: number;
};

export type PriorityGiven = {
  type: "PRIORITY_GIVEN";
  player: string;
};

export type StackObjectPushed = {
  type: "STACK_OBJECT_PUSHED";
  id: string;
  controllerId: string;
  sourceCardId: string;
  kind: "SPELL" | "ABILITY" | "TRIGGER";
};

export type StackObjectResolved = {
  type: "STACK_OBJECT_RESOLVED";
  id: string;
};

export type LogLine = {
  type: "LOG_LINE";
  text: string;
  level: "info" | "debug";
};
