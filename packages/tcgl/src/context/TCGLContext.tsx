import { createContext, useContext, type ReactNode } from "react";
import type { CardInteractionEvents, TCGLContextValue } from "../types";
import { noopCardEvents } from "../types";

const defaultValue: TCGLContextValue = {
  events: noopCardEvents,
};

const TCGLContext = createContext<TCGLContextValue>(defaultValue);

export function TCGLProvider({
  value,
  children,
}: {
  value: Partial<TCGLContextValue> & { events: CardInteractionEvents };
  children: ReactNode;
}) {
  const merged: TCGLContextValue = {
    ...defaultValue,
    ...value,
    events: value.events,
  };
  return (
    <TCGLContext.Provider value={merged}>{children}</TCGLContext.Provider>
  );
}

export function useTCGL() {
  return useContext(TCGLContext);
}

export function useTCGLEvents() {
  return useContext(TCGLContext).events;
}
