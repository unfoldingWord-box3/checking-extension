import {
  CustomTextEditorProvider,
  ExtensionContext,
  Disposable,
  Webview,
  WebviewPanel,
  window,
  workspace,
  TextDocument,
  Uri,
  ViewColumn,
  CancellationToken,
  WorkspaceEdit,
  Range,
} from "vscode";

import { TranslationNotesPanel } from "./panels/TranslationNotesPanel";

/**
 * Provider for tsv editors.
 *
 * TSV Editors are used for .tsv files. This editor is specifically geared
 * towards tsv files that contain translation notes.
 *
 */
export class TnTSVEditorProvider implements CustomTextEditorProvider {
  public static register(context: ExtensionContext): Disposable {
    const provider = new TnTSVEditorProvider(context);
    const providerRegistration = window.registerCustomEditorProvider(
      TnTSVEditorProvider.viewType,
      provider
    );
    return providerRegistration;
  }

  private static readonly viewType = "translation-notes-extension.tsvNoteEditor";

  constructor(private readonly context: ExtensionContext) {}

  /**
   * Called when our custom editor is opened.
   */
  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    _token: CancellationToken
  ): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(this.context.extensionUri, "out"),
        Uri.joinPath(this.context.extensionUri, "webview-ui/build"),
      ],
    };

    new TranslationNotesPanel(webviewPanel, this.context.extensionUri).initializeWebviewContent();

    function updateWebview() {
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText(),
      });
    }

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // TODO: Handle user editing TSV file
    // webviewPanel.webview.onDidReceiveMessage((e) => {
    //   switch (e.type) {
    //     case "add":
    //       this.addNewTSV(document);
    //       return;
    //   }
    // });

    updateWebview();
  }

  /**
   * Try to get a current document as json text.
   *
   * @TODO Use this function to turn doc text into ScriptureTSV!
   */
  private getDocumentAsJson(document: TextDocument): any {
    const text = document.getText();
    if (text.trim().length === 0) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Could not get document as json. Content is not valid json");
    }
  }

  /**
   * Write out the json to a given document.
   *
   * @TODO Incorporate document updates on user input
   */
  // private updateTextDocument(document: TextDocument, json: any) {
  //   const edit = new WorkspaceEdit();

  //   // Just replace the entire document every time for this example extension.
  //   // A more complete extension should compute minimal edits instead.
  //   edit.replace(
  //     document.uri,
  //     new Range(0, 0, document.lineCount, 0),
  //     JSON.stringify(json, null, 2)
  //   );

  //   return workspace.applyEdit(edit);
  // }
}
