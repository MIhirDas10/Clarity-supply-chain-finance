import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Shared design system (tokens + Tailwind) come from Digonto's base.
import "./digonto/index.css";
// Apurba's feature pages (Upload / My Invoices / Payout History) use these classes.
import "./apurba/styles.css";

import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
