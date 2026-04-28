import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { type ReactNode, useLayoutEffect, useMemo } from "react";
import { Color, PCFSoftShadowMap } from "three";
import { TCGLProvider } from "../context/TCGLContext";
import { noopCardEvents, type CardInteractionEvents, type TCGLContextValue } from "../types";

export type TCGLCanvasProps = Omit<CanvasProps, "children" | "events" | "shadows"> & {
  children: ReactNode;
  /** Card interaction sink — not R3F's Canvas `events` (event manager). */
  events?: Partial<CardInteractionEvents>;
  cardWidth?: number;
  /** Scene clear color when `transparentBackground` is false. @default #5a5a62 */
  backgroundColor?: string;
  /**
   * When true, clears the WebGL color buffer with alpha 0 and leaves `scene.background` null
   * so a DOM element behind the canvas (e.g. a 2D playmat image) is visible. 3D content and
   * shadow mapping behave normally. @default false
   */
  transparentBackground?: boolean;
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
 * Solid scene background, or full transparency so a HTML layer under the canvas can show through.
 */
function SceneBackgroundSync({
  transparent,
  backgroundColor,
}: {
  transparent: boolean;
  backgroundColor: string;
}) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    if (transparent) {
      scene.background = null;
      gl.setClearColor(0x000000, 0);
    } else {
      const c = new Color(backgroundColor);
      scene.background = c;
      gl.setClearColor(c, 1);
    }
  }, [backgroundColor, gl, scene, transparent]);
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
  transparentBackground = false,
  style,
  dpr = [1, 2] as [number, number],
  gl: glProp,
  shadows: shadowsEnabled = true,
  ...canvasProps
}: TCGLCanvasProps) {
  const ev = useMemo(() => mergeEvents(events), [events]);
  const providerValue: Partial<TCGLContextValue> & { events: CardInteractionEvents } =
    useMemo(
      () => ({ events: ev, cardWidth, shadows: shadowsEnabled }),
      [ev, cardWidth, shadowsEnabled]
    );
  const gl = useMemo(() => {
    if (typeof glProp === "function") {
      return glProp;
    }
    return {
      antialias: true,
      alpha: true,
      // Better compositing of transparent canvas over HTML when using a 2D backdrop.
      premultipliedAlpha: transparentBackground ? false : true,
      ...(typeof glProp === "object" && glProp !== null && !Array.isArray(glProp) ? glProp : {}),
    };
  }, [glProp, transparentBackground]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        touchAction: "none",
        background: transparentBackground ? "transparent" : undefined,
        ...style,
      }}
    >
      <Canvas
        dpr={dpr}
        gl={gl}
        onPointerMissed={() => undefined}
        {...canvasProps}
        shadows={shadowsEnabled}
      >
        <GlShadowMapSync enabled={shadowsEnabled} />
        <SceneBackgroundSync
          transparent={transparentBackground}
          backgroundColor={backgroundColor}
        />
        <ambientLight intensity={0.78} />
        <directionalLight
          castShadow={shadowsEnabled}
          position={[6, 10, 5]}
          intensity={1.15}
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
