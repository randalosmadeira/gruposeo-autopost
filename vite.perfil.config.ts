// Build da página independente do Perfil do projeto (ver src/perfil-entry.tsx). Saída: dist-perfil/, servida em /perfil-projeto/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  base: "/perfil-projeto/",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") }, dedupe: ["react", "react-dom"] },
  build: {
    outDir: "dist-perfil",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "perfil-projeto.html") },
  },
});
