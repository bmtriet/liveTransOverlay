import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { OverlayWindow } from "./overlay/OverlayWindow";

const params = new URLSearchParams(window.location.search);
const isOverlay = params.has("overlay");
const root = isOverlay ? <OverlayWindow /> : <App />;
createRoot(document.getElementById("root")!).render(<StrictMode>{root}</StrictMode>);
