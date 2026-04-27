import { useCallback, useMemo, useRef, useState } from "react";
import {
  createSession,
  type GameAction,
  type EngineResult,
} from "@tcgl/core";
import { seedDemoGame } from "./seedDemoGame";

export function useDemoSession() {
  const session = useRef(createSession(seedDemoGame()));
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const state = useMemo(
    () => session.current.getState(),
    [version]
  );
  const log = useMemo(
    () => session.current.getLog(),
    [version]
  );

  const dispatch = useCallback((a: GameAction): EngineResult => {
    const r = session.current.dispatch(a);
    setLastError(r.error?.message ?? null);
    setVersion((n) => n + 1);
    return r;
  }, []);

  const reset = useCallback(() => {
    session.current.reset(seedDemoGame());
    setLastError(null);
    setVersion((n) => n + 1);
  }, []);

  return { state, log, dispatch, lastError, reset };
}
