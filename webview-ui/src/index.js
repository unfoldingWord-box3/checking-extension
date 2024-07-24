"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const client_1 = __importDefault(require("react-dom/client"));
const App_1 = __importDefault(require("./App"));
// Assuming the element with id 'root' exists in your HTML file
const rootElement = document.getElementById("root");
// Create a root.
const root = client_1.default.createRoot(rootElement);
// Initial render: Render the TranslationNotesView component to the root.
root.render(<react_1.default.StrictMode>
    <App_1.default />
  </react_1.default.StrictMode>);
//# sourceMappingURL=index.js.map