import "@nextone/design-tokens/tokens.css";
import "./styles/foundation.css";
import "./styles/shell.css";
import "./styles/projects.css";
import "./styles/tasks.css";
import "./styles/review-settings.css";
import "./styles/responsive.css";
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
