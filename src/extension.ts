import { ExtensionContext } from "vscode";
import { CheckingProvider } from "./CheckingProvider";

export function activate(context: ExtensionContext) {
  // Register the custom checker provider
  const { providerRegistration, commandRegistration } =
      CheckingProvider.register(context);
  context.subscriptions.push(providerRegistration);
  context.subscriptions.push(commandRegistration);
}
