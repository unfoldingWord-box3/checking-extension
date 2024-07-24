"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownToHTML = void 0;
const dompurify_1 = __importDefault(require("dompurify"));
const marked_1 = require("marked");
const markdownToHTML = (markdown) => dompurify_1.default.sanitize(marked_1.marked.parse(markdown));
exports.markdownToHTML = markdownToHTML;
//# sourceMappingURL=markdownToHTML.js.map