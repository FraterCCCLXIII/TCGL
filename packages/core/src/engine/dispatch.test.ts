import { describe, expect, it } from "vitest";
import { createEmptyState } from "../types/state";
import { dispatch } from "./dispatch";
import {
  moveCardAction,
  endTurnAction,
  advanceStepAction,
  passPriorityAction,
  castToStackAction,
  toggleCardTappedAction,
} from "../factories";
import { assertReplayFromActions } from "../replay/replayFromActions";

function twoPlayerWithCard() {
  const s = createEmptyState("g1", ["p1", "p2"], "p1");
  s.zoneContents["p1:hand"] = ["c1"];
  s.cards["c1"] = {
    id: "c1",
    definitionId: "test",
    controllerId: "p1",
    tapped: false,
  };
  return s;
}

describe("dispatch", () => {
  it("rejects move when card missing", () => {
    const s = createEmptyState("g1", ["p1", "p2"], "p1");
    const r = dispatch(
      s,
      moveCardAction("p1", "c1", "p1:hand", "shared:battlefield")
    );
    expect(r.error).toBeDefined();
    expect(r.events).toHaveLength(0);
  });

  it("moves card and emits CARD_MOVED", () => {
    const s = twoPlayerWithCard();
    const r = dispatch(
      s,
      moveCardAction("p1", "c1", "p1:hand", "shared:battlefield")
    );
    expect(r.error).toBeUndefined();
    expect(r.events[0]?.type).toBe("CARD_MOVED");
    expect(r.state.zoneContents["shared:battlefield"]).toEqual(["c1"]);
  });

  it("ends turn for active only", () => {
    const s = twoPlayerWithCard();
    const r = dispatch(s, endTurnAction("p2"));
    expect(r.error?.code).toBe("OUT_OF_TURN");
    const r2 = dispatch(s, endTurnAction("p1"));
    expect(r2.error).toBeUndefined();
    expect(r2.state.activePlayer).toBe("p2");
  });

  it("advance step moves phase when stack empty", () => {
    const s = createEmptyState("g1", ["p1", "p2"], "p1");
    const r = dispatch(s, advanceStepAction("p1"));
    expect(r.error).toBeUndefined();
    expect(r.state.turnPhase).toBe("main1");
  });

  it("cast then pass pass resolves stack (2p)", () => {
    const s = twoPlayerWithCard();
    const r0 = dispatch(s, castToStackAction("p1", "c1", "p1:hand"));
    expect(r0.error).toBeUndefined();
    expect(r0.state.stack).toHaveLength(1);
    const s1 = r0.state;
    const r1 = dispatch(s1, passPriorityAction("p1"));
    expect(r1.state.priorityPlayer).toBe("p2");
    const r2 = dispatch(r1.state, passPriorityAction("p2"));
    expect(r2.events.some((e) => e.type === "STACK_OBJECT_RESOLVED")).toBe(true);
  });

  it("replay is stable", () => {
    const s = twoPlayerWithCard();
    const { state, log } = assertReplayFromActions(s, [
      moveCardAction("p1", "c1", "p1:hand", "shared:battlefield"),
      endTurnAction("p1"),
    ]);
    expect(state.activePlayer).toBe("p2");
    expect(log.entries.length).toBeGreaterThan(0);
  });

  it("toggles card tapped for controller", () => {
    const s = twoPlayerWithCard();
    const r = dispatch(s, toggleCardTappedAction("p1", "c1"));
    expect(r.error).toBeUndefined();
    expect(r.state.cards.c1?.tapped).toBe(true);
    expect(r.events[0]).toEqual({
      type: "CARD_TAP_TOGGLED",
      cardId: "c1",
      tapped: true,
    });
    const r2 = dispatch(r.state, toggleCardTappedAction("p1", "c1"));
    expect(r2.state.cards.c1?.tapped).toBe(false);
  });

  it("rejects toggle when wrong controller", () => {
    const s = twoPlayerWithCard();
    const r = dispatch(s, toggleCardTappedAction("p2", "c1"));
    expect(r.error?.code).toBe("ILLEGAL");
    expect(r.state.cards.c1?.tapped).toBe(false);
  });
});
