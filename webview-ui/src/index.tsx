import React from "react";
import ReactDOM from "react-dom/client";
import TranslationNotesView from "./TranslationNotesView";

// Assuming the element with id 'root' exists in your HTML file
const rootElement = document.getElementById("root") as HTMLElement;

// Create a root.
const root = ReactDOM.createRoot(rootElement);

// Initial render: Render the TranslationNotesView component to the root.
root.render(
  <React.StrictMode>
    <TranslationNotesView />
  </React.StrictMode>
);
