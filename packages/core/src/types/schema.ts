/** Bump when `GameAction` / `GameState` / `GameEvent` wire shapes are not backward compatible. */
export const SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof SCHEMA_VERSION;
