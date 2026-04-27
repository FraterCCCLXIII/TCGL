import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    dedupe: [
      "three",
      "react",
      "react-dom",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-spring/three",
    ],
    // Dev against workspace source — not published dist (can go stale in .vite prebundle if omitted)
    alias: {
      tcgl: resolve(root, "../../packages/tcgl/src/index.ts"),
    },
  },
  optimizeDeps: {
    include: [
      "three",
      "react",
      "react-dom",
      "@react-spring/three",
      "@react-three/fiber",
      "@react-three/drei",
    ],
    // Always resolve `tcgl` from the alias; otherwise Vite can cache an old prebundle in node_modules/.vite
    exclude: ["tcgl"],
  },
  server: { port: 5173, open: true },
});
