import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import type { R3FGroupProps } from "../types";
import { type FanOptions, type FanStyle, cardFanLayout } from "../layout/fanLayout";

export type CardFanProps = {
  children?: ReactNode;
  radius?: number;
  /** Only used for `style: "arc"`. */
  arc?: number;
  /**
   * `"ecard"` — linear hand spread, bowl in Z, roll on Z (WaelYasmina/ecard tutorial).
   * `"arc"` — previous trigonometric fan.
   * @default "ecard"
   */
  style?: FanStyle;
  /**
   * Extra pitch on **X** (radians) on the whole hand. **Use `0` (default)** to keep the row in the
   * playmat plane; any non-zero value **tilts** the hand and breaks “level with the mat”.
   */
  faceTiltX?: number;
} & Pick<
  Partial<FanOptions>,
  | "minCenterSpacing"
  | "maxRollZ"
  | "yArch"
  | "zBowl"
  | "zHand"
  | "y"
  | "invertFanX"
> &
  R3FGroupProps;

/**
 * Spreads child cards in a hand layout (default: ecard-style). No rules — just transforms.
 */
export function CardFan({
  children,
  radius,
  arc,
  style = "ecard",
  minCenterSpacing,
  maxRollZ,
  yArch,
  zBowl,
  zHand,
  y,
  invertFanX,
  faceTiltX = 0,
  ...groupProps
}: CardFanProps) {
  const list = Children.toArray(children);
  const n = list.length;
  const perCard = list.map((child, i) => {
    if (!isValidElement(child)) {
      return child;
    }
    const { position, rotation } = cardFanLayout(i, {
      count: n,
      radius,
      arc,
      style,
      minCenterSpacing,
      maxRollZ,
      yArch,
      zBowl,
      zHand,
      y,
      invertFanX,
    });
    return (
      <group key={child.key ?? i} position={position} rotation={rotation}>
        {cloneElement(child, {})}
      </group>
    );
  });
  if (faceTiltX === 0) {
    return <group {...groupProps}>{perCard}</group>;
  }
  return (
    <group {...groupProps}>
      <group rotation-x={faceTiltX}>{perCard}</group>
    </group>
  );
}
