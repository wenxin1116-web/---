import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IconLibrary } from "./app/IconLibrary";
import "./app/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("GitHub Pages root container was not found.");
}

document.documentElement.lang = "zh-CN";
document.body.classList.add("github-pages-body");

createRoot(rootElement).render(
  <StrictMode>
    <IconLibrary staticMode />
  </StrictMode>,
);
