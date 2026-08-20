import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Shared design system (tokens + Tailwind) come from Digonto's base.
import "./digonto/index.css";
// Apurba's feature pages (Upload / My Invoices / Payout History) use these classes.
import "./apurba/styles.css";

import App from "./App.jsx";

const TOKEN_KEY = "clarity_token";
const browserFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input.url;
  const isApiRequest = requestUrl.startsWith("/api/") || requestUrl.startsWith(window.location.origin + "/api/");
  const isPublicAuthRequest = requestUrl.includes("/api/auth/login") || requestUrl.includes("/api/auth/signup");

  if (!isApiRequest || isPublicAuthRequest) {
    return browserFetch(input, init);
  }

  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return browserFetch(input, { ...init, headers });
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
