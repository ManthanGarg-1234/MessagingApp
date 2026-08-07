import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

const container = document.getElementById("root")!;
createRoot(container).render(<App />);

// Register the service worker only in production builds (see webpack.config.js,
// which injects it via InjectManifest). Enables offline caching + installability.
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.error("SW registration failed:", err);
    });
  });
}
