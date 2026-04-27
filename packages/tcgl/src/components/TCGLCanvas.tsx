import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { type ReactNode, useLayoutEffect, useMemo } from "react";
import { PCFSoftShadowMap } from "three";
import { TCGLProvider } from "../context/TCGLContext";
import { noopCardEvents, type CardInteractionEvents, type TCGLContextValue } from "../types";

export type TCGLCanvasProps = Omit<CanvasProps, "children" | "events" | "shadows"> & {
  children: ReactNode;
  /** Card interaction sink — not R3F's Canvas `events` (event manager). */
  events?: Partial<CardInteractionEvents>;
  cardWidth?: number;
  /** Scene clear color (R3F `<color>` background). @default #5a5a62 */
  backgroundColor?: string;
  /**
   * Enable shadow maps (Canvas), key directional `castShadow`, and context for `Card` / `Playmat`.
   * @default true
   */
  shadows?: boolean;
};

function mergeEvents(
  e: Partial<CardInteractionEvents> | undefined
): CardInteractionEvents {
  if (!e) return noopCardEvents;
  return { ...noopCardEvents, ...e };
}

/**
 * R3F often applies `Canvas` `shadows` only on first mount — keep `WebGLRenderer.shadowMap` in sync.
 */
function GlShadowMapSync({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    if (enabled) {
      gl.shadowMap.enabled = true;
      // Softer than default PCF — reduces hard/banded artifacts on large receivers.
      gl.shadowMap.type = PCFSoftShadowMap;
    } else {
      gl.shadowMap.enabled = false;
    }
  }, [gl, enabled]);
  return null;
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
  shadows: shadowsEnabled = true,
  ...canvasProps
}: TCGLCanvasProps) {
  const ev = useMemo(() => mergeEvents(events), [events]);
  const providerValue: Partial<TCGLContextValue> & { events: CardInteractionEvents } =
    useMemo(
      () => ({ events: ev, cardWidth, shadows: shadowsEnabled }),
      [ev, cardWidth, shadowsEnabled]
    );

  return (
    <div style={{ width: "100%", height: "100%", touchAction: "none", ...style }}>
      <Canvas
        dpr={dpr}
        gl={gl}
        onPointerMissed={() => undefined}
        {...canvasProps}
        shadows={shadowsEnabled}
      >
        <GlShadowMapSync enabled={shadowsEnabled} />
        <color attach="background" args={[backgroundColor]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          castShadow={shadowsEnabled}
          position={[6, 10, 5]}
          intensity={0.9}
          shadow-bias={-0.0002}
          shadow-normalBias={0.035}
          shadow-mapSize={[2048, 2048]}
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
