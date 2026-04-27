import { Outlines } from "@react-three/drei";

export type SelectionOutlineProps = {
  color?: string;
  thickness?: number;
};

/** Outlines preset for a card mesh. */
export function SelectionOutline({
  color = "#7eb8ff",
  thickness = 0.04,
}: SelectionOutlineProps) {
  return (
    <Outlines
      color={color}
      thickness={thickness}
      screenspace
      opacity={0.9}
    />
  );
}
