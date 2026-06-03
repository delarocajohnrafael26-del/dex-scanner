import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register a service worker so notifications can fire when the app is in the
// background or wrapped in a WebView APK (e.g. webintoapp).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("SW registration failed", e);
    });
  });
}
