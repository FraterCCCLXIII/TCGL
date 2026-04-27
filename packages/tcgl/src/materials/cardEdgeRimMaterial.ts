import {
  AdditiveBlending,
  BackSide,
  Color,
  FrontSide,
  ShaderMaterial,
  type Texture,
} from "three";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFalloff;
uniform vec2 uSize;
uniform float uRadius;
uniform int uHasAlpha;
uniform sampler2D uAlphaMap;

float sdRoundBox(in vec2 p, in vec2 b, in float r) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = uRadius;
  vec2 b = 0.5 * uSize - vec2(r);
  float d = sdRoundBox(p, b, r);
  if (d > 0.0) { discard; }
  float t = -d;
  float g = exp(-t / uFalloff);
  float a = g * uAlpha;
  if (uHasAlpha == 1) {
    a *= texture2D(uAlphaMap, vUv).a;
  }
  if (a < 0.002) { discard; }
  gl_FragColor = vec4(uColor, a);
}
`;

export function createCardEdgeRimMaterial(opts: {
  color: string | Color;
  falloff: number;
  sizeW: number;
  sizeH: number;
  cornerRadiusWorld: number;
  alphaMap: Texture | null;
  side?: typeof FrontSide | typeof BackSide;
}): ShaderMaterial {
  const c = typeof opts.color === "string" ? new Color(opts.color) : opts.color;
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: opts.side ?? FrontSide,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: c },
      uAlpha: { value: 1 },
      uFalloff: { value: opts.falloff },
      uSize: { value: [opts.sizeW, opts.sizeH] },
      uRadius: { value: opts.cornerRadiusWorld },
      uHasAlpha: { value: opts.alphaMap ? 1 : 0 },
      uAlphaMap: { value: opts.alphaMap },
    },
  });
}

export function setCardRimColor(mat: ShaderMaterial, color: string | Color) {
  const c = typeof color === "string" ? new Color(color) : color.clone();
  mat.uniforms.uColor.value = c;
}

export function setCardRimAlpha(mat: ShaderMaterial, alpha: number) {
  mat.uniforms.uAlpha.value = alpha;
}
