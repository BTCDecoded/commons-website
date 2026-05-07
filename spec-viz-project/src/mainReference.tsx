import React from "react";
import ReactDOM from "react-dom/client";
import ReferenceApp from "./ReferenceApp";
import "katex/dist/katex.min.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReferenceApp />
  </React.StrictMode>,
);
