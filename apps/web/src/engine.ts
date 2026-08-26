// Re-export the pure game engine so the import path lives in exactly one place.
// (No root package.json / workspace resolution — relative path to packages/.)
export * from "../../../packages/game-core/src/index.ts";
