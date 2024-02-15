import { commands, ExtensionContext } from "vscode";
import { TnTSVEditorProvider } from "./TnTSVEditorProvider";

export function activate(context: ExtensionContext) {
  // Register the custom tsv editor provider
  context.subscriptions.push(TnTSVEditorProvider.register(context));
}
