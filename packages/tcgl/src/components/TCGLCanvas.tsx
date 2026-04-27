import { Canvas, type CanvasProps } from "@react-three/fiber";
import { type ReactNode, useMemo } from "react";
import { TCGLProvider } from "../context/TCGLContext";
import { noopCardEvents, type CardInteractionEvents, type TCGLContextValue } from "../types";

export type TCGLCanvasProps = Omit<CanvasProps, "children" | "events"> & {
  children: ReactNode;
  /** Card interaction sink — not R3F's Canvas `events` (event manager). */
  events?: Partial<CardInteractionEvents>;
  cardWidth?: number;
  /** Scene clear color (R3F `<color>` background). @default #5a5a62 */
  backgroundColor?: string;
};

function mergeEvents(
  e: Partial<CardInteractionEvents> | undefined
): CardInteractionEvents {
  if (!e) return noopCardEvents;
  return { ...noopCardEvents, ...e };
}

/**
 * R3F canvas + TCGL event context. Your game stays outside; this is presentation.
 */
export function TCGLCanvas({
  children,
  events,
  cardWidth,
  backgroundColor = "#5a5a62",
  style,
  dpr = [1, 2] as [number, number],
  gl = { antialias: true, alpha: true },
  ...canvasProps
}: TCGLCanvasProps) {
  const ev = useMemo(() => mergeEvents(events), [events]);
  const providerValue: Partial<TCGLContextValue> & { events: CardInteractionEvents } =
    useMemo(
      () => ({ events: ev, cardWidth }),
      [ev, cardWidth]
    );

  return (
    <div style={{ width: "100%", height: "100%", touchAction: "none", ...style }}>
      <Canvas
        dpr={dpr}
        gl={gl}
        shadows
        onPointerMissed={() => undefined}
        {...canvasProps}
      >
        <color attach="background" args={[backgroundColor]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          castShadow
          position={[6, 10, 5]}
          intensity={0.9}
          shadow-bias={-0.00012}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-far={40}
          shadow-camera-near={0.1}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
        />
        <TCGLProvider value={providerValue}>{children}</TCGLProvider>
      </Canvas>
    </div>
  );
}
