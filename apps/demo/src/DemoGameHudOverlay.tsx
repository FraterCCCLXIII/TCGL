import hudArtUrl from "./assets/demo-hud-overlay.svg?url";

/**
 * Non-interactive demo HUD art (screen-fixed, pointer-events none).
 * SVG is imported with `?url` so Vite emits a correct URL in dev and production.
 */
export function DemoGameHudOverlay() {
  return (
    <div className="demo-game-hud" aria-hidden>
      <img
        className="demo-game-hud__svg"
        src={hudArtUrl}
        alt=""
        width={2568}
        height={809}
        decoding="async"
      />
    </div>
  );
}
