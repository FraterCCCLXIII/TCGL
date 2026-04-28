import {
  MeshDepthMaterial,
  RGBADepthPacking,
  type Texture,
} from "three";

export const TCGL_SHADOW_FADE_UNIFORM = "tcglShadowFadeUniform" as const;

/**
 * Depth material for directional/spot shadow maps: {@link RGBADepthPacking} with optional alpha cutout
 * (rounded card). Uniform {@link TCGL_SHADOW_FADE_UNIFORM} mixes packed depth toward the far plane so
 * cast shadows soften to nothing (HUD) or return (table).
 */
export function createCardFaceShadowDepthMaterial(
  alphaMap: Texture | null | undefined,
  alphaTest: number
): MeshDepthMaterial {
  const fadeUniform = { value: 1 };
  const mat = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    alphaMap: alphaMap ?? undefined,
    alphaTest: alphaMap != null && alphaTest > 0 ? alphaTest : 0,
  });
  (mat.userData as Record<string, unknown>)[TCGL_SHADOW_FADE_UNIFORM] =
    fadeUniform;

  mat.onBeforeCompile = (parameters) => {
    parameters.uniforms.uShadowFade = fadeUniform;
    parameters.fragmentShader = parameters.fragmentShader.replace(
      "varying vec2 vHighPrecisionZW;",
      "varying vec2 vHighPrecisionZW;\nuniform float uShadowFade;"
    );
    // Mix in linear clip depth before packing — mixing packed RGBA was incorrect for the shadow test.
    parameters.fragmentShader = parameters.fragmentShader.replace(
      "gl_FragColor = packDepthToRGBA( fragCoordZ );",
      "gl_FragColor = packDepthToRGBA( mix( 1.0, fragCoordZ, uShadowFade ) );"
    );
  };

  return mat;
}
