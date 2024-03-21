import { ExtensionContext } from "vscode";
import { TranslationNotesProvider } from "./TranslationNotesProvider";

export function activate(context: ExtensionContext) {
  // Register the custom tsv editor provider
  const { providerRegistration, commandRegistration } =
      TranslationNotesProvider.register(context);
  context.subscriptions.push(providerRegistration);
  context.subscriptions.push(commandRegistration);
}
