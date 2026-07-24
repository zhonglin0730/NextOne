import "@nextone/design-tokens/tokens.css";
import "./styles.css";
import "./i18n";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
