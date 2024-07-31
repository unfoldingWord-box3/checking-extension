// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CheckingProvider } from "./CheckingProvider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "checking-extension" is now active!');

	// vscode.window.showInformationMessage('Loaded checking-extension!');
	
	// Register the custom checker provider
	const subscriptions =
		CheckingProvider.register(context);

	subscriptions.forEach(subscription => {
		context.subscriptions.push(subscription);
	})
}

// This method is called when your extension is deactivated
export function deactivate() {}
