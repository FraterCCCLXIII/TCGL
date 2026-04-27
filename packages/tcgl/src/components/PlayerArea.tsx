import {
  forwardRef,
  type ReactNode,
  useMemo,
  type Ref,
} from "react";
import type { Group } from "three";
import type { PlaymatSide, R3FGroupProps } from "../types";

/** `side` omitted from R3F `group` props — DOM **`side`** would collide with playmat side. */
export type PlayerAreaProps = Omit<R3FGroupProps, "side"> & {
  side: PlaymatSide;
  children?: ReactNode;
};

const defaultOffset: Record<PlaymatSide, [number, number, number]> = {
  near: [0, 0, 2.2],
  far: [0, 0, -2.2],
};

/**
 * Clusters a player’s table regions. Does not model turns or rules.
 * Forward **`ref`** to the root **`group`** for world/local projections (e.g. drag planes).
 */
export const PlayerArea = forwardRef<Group, PlayerAreaProps>(
  function PlayerArea(props: PlayerAreaProps, ref) {
  const { side, userData, children, position: positionProp, ...rest } =
    props;
  const merged = useMemo(
    () => ({ ...userData, playmatSide: side }),
    [userData, side]
  );
  const position = (positionProp ?? defaultOffset[side]) as [
    number,
    number,
    number,
  ];
  return (
    <group ref={ref as Ref<Group>} userData={merged} position={position} {...rest}>
      {children}
    </group>
  );
}
);
