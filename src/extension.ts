import { commands, ExtensionContext } from "vscode";
import { TranslationNotesPanel } from "./panels/TranslationNotesPanel";

export function activate(context: ExtensionContext) {
  // Create the show translation notes command
  const showTranslationNotesCommand = commands.registerCommand(
    "translation-notes-viewer.showTranslationNotes",
    () => {
      TranslationNotesPanel.render(context.extensionUri);
    }
  );

  // Add command to the extension context
  context.subscriptions.push(showTranslationNotesCommand);
}
