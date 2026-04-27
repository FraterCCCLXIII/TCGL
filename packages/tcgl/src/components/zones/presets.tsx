import type { ReactNode } from "react";
import { Zone } from "../Zone";
import type { LayoutKind, R3FGroupProps } from "../../types";

type Common = { id: string; layout?: LayoutKind; children?: ReactNode } & R3FGroupProps;

export function DeckZone({ id, children, layout = "stack", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="deck" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}

export function HandZone({ id, children, layout = "fan", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="hand" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}

export function BattlefieldZone({ id, children, layout = "grid", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="battlefield" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}

export function GraveyardZone({ id, children, layout = "pile", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="graveyard" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}

export function ExileZone({ id, children, layout = "pile", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="exile" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}

export function StackZone({ id, children, layout = "stack", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="stack" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}

export function SideboardZone({ id, children, layout = "stack", ...rest }: Common) {
  return (
    <Zone id={id} zoneKind="sideboard" layout={layout} {...rest}>
      {children}
    </Zone>
  );
}
