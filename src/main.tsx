import "./instrument";

import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorFallback } from "@/components/AppErrorFallback";

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<AppErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>,
);
