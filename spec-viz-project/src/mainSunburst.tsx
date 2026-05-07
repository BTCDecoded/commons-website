import React from "react";
import ReactDOM from "react-dom/client";
import AppSunburst from "./AppSunburst";
import "katex/dist/katex.min.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppSunburst />
  </React.StrictMode>,
);
