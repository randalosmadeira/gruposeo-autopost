import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Telas pesadas (NexusProviders, nexus-management-page) levam ~1 s sozinhas, mas passam de 5 s quando a suíte inteira roda em
    // paralelo e a máquina está carregada: reprovavam ao acaso, sem mudança de código (confirmado em 15/11/2026 com e sem o P0).
    // 20 s elimina o falso negativo e continua pegando travamento real.
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
