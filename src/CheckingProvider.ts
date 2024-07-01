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

import { TranslationNotesPanel } from "./panels/TranslationNotesPanel";
import { ResourcesObject, TranslationCheckingPostMessages } from "../types";
import { ScriptureTSV } from "../types/TsvTypes";
import { initProject } from "./utilities/checkerFileUtils";
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import { loadResources } from "./utilities/checkingServerUtils";


type CommandToFunctionMap = Record<string, (text: string) => void>;

// const getTnUri = (bookID: string): Uri => {
//     const workspaceRootUri = workspace.workspaceFolders?.[0].uri as Uri;
//     return Uri.joinPath(
//       workspaceRootUri,
//       `tn_${bookID}.check`,
//     );
// };
//
// const getTwlUri = (bookID: string): Uri => {
//     const workspaceRootUri = workspace.workspaceFolders?.[0].uri as Uri;
//     return Uri.joinPath(
//       workspaceRootUri,
//       `twl_${bookID}.check`,
//     );
// };

/**
 * Provider for tsv editors.
 *
 * Checking Editors are used for .tn_check and .twl_check files. This editor is specifically geared
 * making selections in the target language and saving them in the check file.
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
            "checking-extension.initTranslationChecker",
            async (verseRef: string) => {
                const resourcesBasePath = path.join(ospath.home(), 'translationCore/temp/downloaded');
                const updatedResourcesPath = path.join(resourcesBasePath, 'updatedResources.json')
                const completeResourcesPath = path.join(resourcesBasePath, 'completeResources.json')
                
                const gl_owner = 'unfoldingWord'
                const gl_languageId = 'en'
                const targetLanguageId = 'es-419'
                const targetOwner = 'es-419_gl'
                const targetBibleId = 'glt'
                const projectId = 'tn'
                const repoPath = path.join(resourcesBasePath, '../projects', `${targetLanguageId}_${projectId}_checks`)
                const success = await initProject(repoPath, targetLanguageId, targetOwner, targetBibleId, gl_languageId, gl_owner, resourcesBasePath, projectId)
                if (!success) {
                    console.error(`checking-extension.initTranslationChecker - failed to init folder ${repoPath}`)
                }
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
                data: this.getCheckingResources(document),
            } as TranslationCheckingPostMessages);
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
    private getCheckingResources(document: TextDocument):null|ResourcesObject {
        const filePath = document.fileName;
        if (!filePath) {
            return {};
        }

        try {
            return loadResources(filePath);
        } catch {
            throw new Error(
                "Could not get document as json. Content is not valid scripture TSV",
            );
        }
        return null
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
