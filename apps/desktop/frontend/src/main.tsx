import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Import PDF.js viewer CSS first, then override with our app styles
import "pdfjs-dist/web/pdf_viewer.css";
import "./app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
