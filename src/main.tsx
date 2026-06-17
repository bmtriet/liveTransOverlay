import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { OverlayWindow } from "./overlay/OverlayWindow";

const isOverlay = new URLSearchParams(window.location.search).has("overlay");
createRoot(document.getElementById("root")!).render(<StrictMode>{isOverlay ? <OverlayWindow /> : <App />}</StrictMode>);
