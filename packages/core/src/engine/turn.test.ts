import { describe, expect, it } from "vitest";
import { createEmptyState } from "../types/state";
import { applyAdvanceStep, applyEndTurn } from "./turn";
import { TURN_PHASE_ORDER } from "../types/turn";

describe("turn / phase machine", () => {
  it("applyAdvanceStep walks TURN_PHASE_ORDER until next player", () => {
    const s0 = createEmptyState("g", ["p1", "p2"], "p1");
    let s = s0;
    for (let i = 0; i < TURN_PHASE_ORDER.length; i++) {
      const r = applyAdvanceStep(s);
      s = r.state;
      if (i < TURN_PHASE_ORDER.length - 1) {
        expect(r.events[0]?.type).toBe("STEP_ENTERED");
      }
    }
    expect(s.activePlayer).toBe("p2");
    expect(s.turnPhase).toBe("beginning");
  });

  it("applyEndTurn skips to next player", () => {
    const s0 = createEmptyState("g", ["p1", "p2"], "p1");
    const r = applyEndTurn(s0, "p1");
    if (r === "not_active") {
      throw new Error("expected active");
    }
    expect(r.state.activePlayer).toBe("p2");
  });
});
