import {
    CustomTextEditorProvider,
    ExtensionContext,
    Disposable,
    WebviewPanel,
    window,
    workspace,
    TextDocument,
    CancellationToken,
    commands,
    Uri,
    ViewColumn,
} from "vscode";

import { tsvStringToScriptureTSV } from "./utilities/tsvFileConversions";
import { TranslationNotesPanel } from "./panels/TranslationNotesPanel";
import { extractBookChapterVerse } from "./utilities/extractBookChapterVerse";
import { TranslationNotePostMessages } from "../types";
import { ScriptureTSV } from "../types/TsvTypes";
import { initProject } from "./utilities/checkerFileUtils";
// @ts-ignore
import path from "path-extra";
// @ts-ignore
import ospath from 'ospath';

type CommandToFunctionMap = Record<string, (text: string) => void>;

const getTnUri = (bookID: string): Uri => {
    const workspaceRootUri = workspace.workspaceFolders?.[0].uri as Uri;
    return Uri.joinPath(
      workspaceRootUri,
      `tn_${bookID}.check`,
    );
};

const getTwlUri = (bookID: string): Uri => {
    const workspaceRootUri = workspace.workspaceFolders?.[0].uri as Uri;
    return Uri.joinPath(
      workspaceRootUri,
      `twl_${bookID}.check`,
    );
};

/**
 * Provider for tsv editors.
 *
 * TSV Editors are used for .tsv files. This editor is specifically geared
 * towards tsv files that contain translation notes.
 *
 */
export class CheckingProvider implements CustomTextEditorProvider {
    public static register(context: ExtensionContext): {
        providerRegistration: Disposable;
        commandRegistration: Disposable;
    } {
        const provider = new CheckingProvider(context);
        const providerRegistration = window.registerCustomEditorProvider(
            CheckingProvider.viewType,
            provider,
        );

        const commandRegistration = commands.registerCommand(
            "checking-extension.openCheckerTW",
            async (verseRef: string) => {
                const resourcesBasePath = path.join(ospath.home(), 'translationCore/temp/downloaded');
                const updatedResourcesPath = path.join(resourcesBasePath, 'updatedResources.json')
                const completeResourcesPath = path.join(resourcesBasePath, 'completeResources.json')
                
                const gl_owner = 'unfoldingWord'
                const gl_languageId = 'en'
                const languageId = 'en'
                const projectId = 'twl'
                const repoPath = path.join(resourcesBasePath, '../projects', `${languageId}_${projectId}_checks`)
                const success = await initProject(repoPath, languageId, gl_languageId, gl_owner, resourcesBasePath, projectId)
            },
        );

        return { providerRegistration, commandRegistration };
    }
    
    private static readonly viewType = "checking-extension.translationChecker";

    constructor(private readonly context: ExtensionContext) {}

    /**
     * Called when our custom editor is opened.
     */
    public async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };

        const updateWebview = () => {
            webviewPanel.webview.postMessage({
                command: "update",
                data: this.getDocumentAsScriptureTSV(document),
            } as TranslationNotePostMessages);
        };

        const messageEventHandlers = (message: any) => {
            const { command, text } = message;

            const commandToFunctionMapping: CommandToFunctionMap = {
                ["loaded"]: updateWebview,
            };

            commandToFunctionMapping[command](text);
        };

        new TranslationNotesPanel(
            webviewPanel,
            this.context.extensionUri,
            messageEventHandlers,
        ).initializeWebviewContent();

        // Hook up event handlers so that we can synchronize the webview with the text document.
        //
        // The text document acts as our model, so we have to sync change in the document to our
        // editor and sync changes in the editor back to the document.
        //
        // Remember that a single text document can also be shared between multiple custom
        // editors (this happens for example when you split a custom editor)
        const changeDocumentSubscription = workspace.onDidChangeTextDocument(
            (e) => {
                if (e.document.uri.toString() === document.uri.toString()) {
                    updateWebview();
                }
            },
        );

        // Make sure we get rid of the listener when our editor is closed.
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        // TODO: Put Global BCV function here
    }

    /**
     * Try to get a current document as a scripture TSV object
     *
     * @TODO Use this function to turn doc text into ScriptureTSV!
     */
    private getDocumentAsScriptureTSV(document: TextDocument): ScriptureTSV {
        const text = document.getText();
        if (text.trim().length === 0) {
            return {};
        }

        try {
            return tsvStringToScriptureTSV(text);
        } catch {
            throw new Error(
                "Could not get document as json. Content is not valid scripture TSV",
            );
        }
    }

    /**
     * Write out the json to a given document.
     *
     * @TODO Incorporate document updates on user input
     */
    // private updateTextDocument(document: TextDocument, json: any) {
    //   const edit = new WorkspaceEdit();
    //   edit.replace();
    //   return workspace.applyEdit(edit);
    // }
}
