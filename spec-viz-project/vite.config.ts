import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        reference: path.resolve(__dirname, "reference.html"),
        sunburst: path.resolve(__dirname, "sunburst.html"),
      },
    },
  },
});
