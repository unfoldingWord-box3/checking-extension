import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Assuming the element with id 'root' exists in your HTML file
const rootElement = document.getElementById("root") as HTMLElement;

// Create a root.
const root = ReactDOM.createRoot(rootElement);

// Initial render: Render the App component to the root.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
