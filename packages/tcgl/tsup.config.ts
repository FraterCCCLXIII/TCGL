import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@react-spring/three",
    "zustand",
  ],
  treeshake: true,
});
