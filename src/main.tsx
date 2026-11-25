// Articula's page: the kit's styles, React Flow's, then the app's own (styles.css), then the app.
import "@paperboatlab/ui/tokens.css";
import "@paperboatlab/ui/ui.css";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

document.documentElement.dataset.app = "articula";
createRoot(document.getElementById("root")!).render(<App />);
