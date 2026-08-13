import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function githubPagesBase() {
  if (!process.env.GITHUB_ACTIONS) return "/";
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return repoName ? `/${repoName}/` : "/";
}

export default defineConfig({
  base: githubPagesBase(),
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
  plugins: [react()],
});
