import { ContactShadows, Line, MeshReflectorMaterial } from "@react-three/drei";
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { type LineSegments, Vector3 } from "three";
import { useTCGL } from "../context/TCGLContext";
import type { R3FGroupProps } from "../types";
import { buildPlaymatGridGeometryBuffer } from "./playmatGridLines";

/** Floor-group +Z of procedural top faces; must match `mesh` positions in the floor group. */
const PLAYMAT_PLANE_Z = 0.001;
const PLAYMAT_PLANE_Z_SPLIT = 0.0015;

export type PlaymatGridConfig = {
  show?: boolean;
  /** Cells along the playmat **width** (X). @default 8 */
  divisionsX?: number;
  /** Cells along the playmat **depth** (Y in floor group). @default 7 */
  divisionsY?: number;
  color?: string;
  opacity?: number;
  /**
   * Extra +Z in the floor group, added on top of the playmat **surface** plane (not above it by
   * default). Use only to fix z-fighting if needed.
   * @default 0
   */
  zOffset?: number;
};

const defaultPlaymatGrid: Required<PlaymatGridConfig> = {
  show: true,
  divisionsX: 8,
  divisionsY: 7,
  color: "#2a2a36",
  opacity: 0.5,
  zOffset: 0,
};

function resolvePlaymatGrid(
  g: boolean | PlaymatGridConfig | undefined
): PlaymatGridConfig | null {
  if (g == null || g === false) {
    return null;
  }
  if (g === true) {
    return { ...defaultPlaymatGrid };
  }
  if (g.show === false) {
    return null;
  }
  return { ...defaultPlaymatGrid, ...g };
}

export type PlaymatProps = {
  children?: ReactNode;
  size?: [number, number];
  y?: number;
  color?: string;
  reflector?: boolean;
  /**
   * Two-tone table along **playmat depth** (near vs far, seam runs across **width**). `near` tints
   * the +Y half of the floor plane in the mat’s local space (+Z toward the “near” side after tilt).
   */
  splitSides?: { near: string; far: string };
  showCenterSeam?: boolean;
  showZoneGuides?: boolean;
  /** Soft contact-style shadows for objects above the mat (drei `ContactShadows`). @default true */
  contactShadows?: boolean;
  /**
   * When false, omits the procedural table meshes and contact shadows; `tilt` / `position` still
   * apply to children. @default true
   */
  showSurface?: boolean;
  /**
   * Renders a full `w`×`d` `ShadowMaterial` floor (invisible except for received shadows) when
   * there is no procedural `showSurface` — use with a 2D playmat in HTML/CSS behind a
   * transparent WebGL clear (the art is not part of the 3D scene).
   * @default false
   */
  shadowCatcher?: boolean;
  /**
   * How dark the received directional + ambient-shadow term reads on the shadow catcher. @default 0.22
   */
  shadowCatcherOpacity?: number;
  /**
   * World-space Euler rotation of the playmat **root** (radians, `[x, y, z]` = pitch / yaw / roll).
   * Tips the table surface and all children together. @default [0, 0, 0]
   */
  tilt?: [number, number, number];
  /**
   * Optional top-face grid (`LineSegments`). Does **not** cast or receive directional shadow maps
   * (enforced in code). Ignored if `showSurface` is false.
   * @default off
   */
  playmatGrid?: boolean | PlaymatGridConfig;
} & Omit<R3FGroupProps, "position"> & {
  position?: R3FGroupProps["position"];
};

/**
 * Main table surface. A player/opponent “split” is only visual, not a rule.
 */
export function Playmat({
  children,
  size = [16, 12],
  y = 0,
  color = "#5c5c64",
  reflector = false,
  splitSides,
  showCenterSeam = true,
  showZoneGuides = false,
  contactShadows = true,
  showSurface = true,
  shadowCatcher = false,
  shadowCatcherOpacity = 0.22,
  tilt = [0, 0, 0] as [number, number, number],
  playmatGrid: playmatGridProp,
  ...groupProps
}: PlaymatProps) {
  const [w, d] = size;
  const args = useMemo(() => [w, d] as [number, number], [w, d]);
  const halfD = d / 2;
  /** `splitSides` planes: `w` × `d/2` (full width, half depth) — seam runs along the width (±X) so “near / far” follow the `d` axis (playmat “depth”). */
  const splitHalfDepthArgs = useMemo(
    () => [w, halfD] as [number, number],
    [w, halfD]
  );
  const yNum = y;
  const margin = 0.98;
  const { shadows: shadowsOn } = useTCGL();
  /** Invisible table that only shows shadows — not combined with a solid procedural top. */
  const useShadowCatcher = shadowCatcher && !showSurface;
  const hasFloor = showSurface || useShadowCatcher;
  const showContact = contactShadows && shadowsOn && hasFloor;
  const guide = useMemo(() => {
    const hw = (w * margin) / 2;
    const hd = (d * margin) / 2;
    return [
      new Vector3(-hw, 0, -hd),
      new Vector3(hw, 0, -hd),
      new Vector3(hw, 0, hd),
      new Vector3(-hw, 0, hd),
      new Vector3(-hw, 0, -hd),
    ];
  }, [d, w]);

  const gridCfg = useMemo(
    () => resolvePlaymatGrid(playmatGridProp),
    [playmatGridProp]
  );
  const resolvedGrid = useMemo(() => {
    if (!gridCfg) {
      return null;
    }
    return { ...defaultPlaymatGrid, ...gridCfg };
  }, [gridCfg]);
  const gridGeometry = useMemo(() => {
    if (!showSurface || !resolvedGrid) {
      return null;
    }
    const c = resolvedGrid;
    const planeZ = splitSides ? PLAYMAT_PLANE_Z_SPLIT : PLAYMAT_PLANE_Z;
    return buildPlaymatGridGeometryBuffer({
      w,
      d,
      z: planeZ + c.zOffset,
      divisionsX: c.divisionsX,
      divisionsY: c.divisionsY,
      includeTableSplitLine: Boolean(splitSides),
    });
  }, [showSurface, resolvedGrid, splitSides, w, d]);
  useLayoutEffect(() => {
    return () => {
      gridGeometry?.dispose();
    };
  }, [gridGeometry]);

  const playmatGridLineRef = useRef<LineSegments | null>(null);
  useLayoutEffect(() => {
    const o = playmatGridLineRef.current;
    if (!o) {
      return;
    }
    o.castShadow = false;
    o.receiveShadow = false;
  }, [showSurface, gridGeometry]);

  return (
    <group
      position={[0, yNum, 0]}
      {...groupProps}
      rotation={tilt as [number, number, number]}
    >
      {hasFloor ? (
        <>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            {useShadowCatcher ? (
              <mesh position={[0, 0, 0]} receiveShadow={shadowsOn} renderOrder={0}>
                <planeGeometry args={args} />
                <shadowMaterial
                  color="#000000"
                  opacity={shadowCatcherOpacity}
                  transparent
                />
              </mesh>
            ) : null}
            {showSurface ? (
              splitSides ? (
                <>
                  {/**
                   * Floor group: local X = width `w`, local Y = depth `d`. Seam is at y=0 (along +X):
                   * near = +Y half (typically +Z after tilt, player side), far = −Y half.
                   */}
                  <mesh
                    position={[0, d / 4, PLAYMAT_PLANE_Z_SPLIT]}
                    receiveShadow={shadowsOn}
                    renderOrder={0}
                  >
                    <planeGeometry args={splitHalfDepthArgs} />
                    <meshStandardMaterial
                      color={splitSides.near}
                      roughness={0.92}
                      metalness={0.04}
                    />
                  </mesh>
                  <mesh
                    position={[0, -d / 4, PLAYMAT_PLANE_Z_SPLIT]}
                    receiveShadow={shadowsOn}
                    renderOrder={0}
                  >
                    <planeGeometry args={splitHalfDepthArgs} />
                    <meshStandardMaterial
                      color={splitSides.far}
                      roughness={0.92}
                      metalness={0.04}
                    />
                  </mesh>
                  {showCenterSeam && (
                    <mesh position={[0, 0, 0.0025]} renderOrder={0}>
                      <planeGeometry args={[w, 0.04]} />
                      <meshStandardMaterial
                        color="#6c6c74"
                        emissive="#4e4e56"
                        emissiveIntensity={0.12}
                      />
                    </mesh>
                  )}
                </>
              ) : reflector ? (
                <mesh position={[0, 0, PLAYMAT_PLANE_Z]} receiveShadow={shadowsOn}>
                  <planeGeometry args={args} />
                  <MeshReflectorMaterial
                    color={color}
                    blur={[256, 128]}
                    resolution={256}
                    mirror={0.35}
                  />
                </mesh>
              ) : (
                <mesh position={[0, 0, PLAYMAT_PLANE_Z]} receiveShadow={shadowsOn}>
                  <planeGeometry args={args} />
                  <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} />
                </mesh>
              )
            ) : null}

            {showZoneGuides && !splitSides && showSurface && (
              <Line
                points={guide}
                color="#7a7a86"
                lineWidth={1}
                opacity={0.4}
                transparent
                position={[0, 0.002, 0]}
              />
            )}
            {showSurface && gridGeometry && resolvedGrid ? (
              <lineSegments
                ref={playmatGridLineRef}
                castShadow={false}
                receiveShadow={false}
                frustumCulled={false}
                geometry={gridGeometry}
                /**
                 * After ContactShadows (default 0) so the grid is not interleaved in depth with
                 * the soft shadow pass when pitch/angle changes.
                 */
                renderOrder={20}
              >
                <lineBasicMaterial
                  color={resolvedGrid.color}
                  transparent
                  opacity={resolvedGrid.opacity}
                  depthTest
                  depthWrite={false}
                  fog={false}
                  /** Prevent shadow-map / layer interaction with the table when tilted. */
                  toneMapped={false}
                  polygonOffset
                  polygonOffsetFactor={-0.35}
                  polygonOffsetUnits={-0.35}
                />
              </lineSegments>
            ) : null}
          </group>
          {showContact ? (
            <ContactShadows
              position={[0, 0.002, 0]}
              resolution={256}
              width={1}
              height={1}
              scale={[w, d]}
              opacity={0.48}
              blur={1.4}
              far={16}
            />
          ) : null}
        </>
      ) : null}
      {children}
    </group>
  );
}
