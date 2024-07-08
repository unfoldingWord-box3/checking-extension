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

import { TranslationCheckingPanel } from "./panels/TranslationCheckingPanel";
import { ResourcesObject, TranslationCheckingPostMessages } from "../types";
import {
    fileExists,
    findBibleResources,
    findOwnersForLang,
    findResourcesForLangAndOwner,
    getLanguagesInCatalog,
    getLatestResources,
    getResourceIdsInCatalog,
    getSavedCatalog,
    initProject,
    projectsBasePath,
    resourcesPath,
} from "./utilities/checkerFileUtils";
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import { loadResources } from "./utilities/checkingServerUtils";
import * as vscode from "vscode";
import {
    getGatewayLanguages,
    getLanguageCodeFromPrompts,
    getLanguagePrompts
} from "./utilities/languages";


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
                window.showInformationMessage('initializing Checker');

                let project;
                let fileExists_ = false
                const workspaceFolder = vscode.workspace.workspaceFolders
                  ? vscode.workspace.workspaceFolders[0]
                  : undefined;
                if (workspaceFolder) {
                    const projectFilePath = vscode.Uri.joinPath(
                      workspaceFolder.uri,
                      "metadata.json"
                    );
                    fileExists_ = await vscode.workspace.fs.stat(projectFilePath).then(
                      () => true,
                      () => false
                    );
                    try {
                        const projectFileData = await vscode.workspace.fs.readFile(projectFilePath);
                        project = JSON.parse(projectFileData.toString());
                    } catch (error) {
                        console.warn("Metadata file does not exist.");
                    }
                }
                
                if (!fileExists_) {
                    const options = await CheckingProvider.getCheckingOptions();
                    if (options) {
                        const {
                            catalog,
                            gwLanguagePick: gl_languageId,
                            gwOwnerPick: gl_owner,
                            targetLanguagePick: targetLanguageId,
                            targetOwnerPick: targetOwner,
                            targetBibleIdPick: targetBibleId,
                        } = options;

                        const repoPath = path.join(projectsBasePath, `${targetLanguageId}_${targetBibleId}`)

                        const repoExists = fileExists(repoPath)
                        if (!repoExists) {
                            window.showInformationMessage(`Initializing project which can take a while if resources have to be downloaded, at ${repoPath}`);
                            const success = await initProject(repoPath, targetLanguageId, targetOwner || "", targetBibleId || "", gl_languageId, gl_owner || "", resourcesPath, null, catalog);
                            if (success) {
                                window.showInformationMessage(`Created project at ${repoPath}`);
                                const uri = vscode.Uri.file(repoPath);
                                vscode.commands.executeCommand('vscode.openFolder', uri);
                            } else {
                                window.showInformationMessage(`Failed to initialize project at ${repoPath}`);
                            }
                        } else {
                            window.showInformationMessage(`Cannot create project, folder already exists at ${repoPath}`);
                        }
                    }
                }

                // const gl_owner = 'unfoldingWord'
                // const gl_languageId = 'en'
                // const targetLanguageId = 'es-419'
                // const targetOwner = 'es-419_gl'
                // const targetBibleId = 'glt'
                // const projectId = 'tn'
                // const repoPath = path.join(resourcesBasePath, '../projects', `${targetLanguageId}_${projectId}_checks`)
                // const success = await initProject(repoPath, targetLanguageId, targetOwner, targetBibleId, gl_languageId, gl_owner, resourcesBasePath, projectId)
                // if (!success) {
                //     console.error(`checking-extension.initTranslationChecker - failed to init folder ${repoPath}`)
                // }
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

        new TranslationCheckingPanel(
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
    private getCheckingResources(document: TextDocument):ResourcesObject {
        let checks = document.getText();
        if (checks.trim().length === 0) {
            return {};
        }

        const filePath = document.fileName;
        if (!filePath) {
            return {};
        }

        try {
            const resources = loadResources(filePath) || {};
            checks = JSON.parse(checks)
            // @ts-ignore
            resources.checks = checks
            return resources;
        } catch {
            throw new Error(
                "Could not get document as json. Content is not valid check file in json format",
            );
        }
        return { }
    }

    private static async getCheckingOptions() {
        const options = await CheckingProvider.getGatewayLangOptions();
        if (!options) {
            return null
        }

        const {
            catalog,
            gwLanguagePick,
            gwOwnerPick
        } = options;

        //////////////////////////////////
        // Target language

        // @ts-ignore
        const targetLangChoices = getLanguagePrompts(getLanguagesInCatalog(catalog))
        let targetLanguagePick = await vscode.window.showQuickPick(
          targetLangChoices,
          {
              placeHolder: "Select the target language",
          }
        );
        // @ts-ignore
        targetLanguagePick = getLanguageCodeFromPrompts(targetLanguagePick) || 'en'
        window.showInformationMessage(`Target language selected ${targetLanguagePick}`);

        const targetOwners = findOwnersForLang(catalog || [], targetLanguagePick)
        const targetOwnerPick = await vscode.window.showQuickPick(
          targetOwners,
          {
              placeHolder: "Select the target organization",
          }
        );
        window.showInformationMessage(`Target owner selected ${targetOwnerPick}`);

        const resources = findResourcesForLangAndOwner(catalog || [], targetLanguagePick, targetOwnerPick || '')
        const bibles = findBibleResources(resources || [])
        const bibleIds = getResourceIdsInCatalog(bibles || [])
        const targetBibleIdPick = await vscode.window.showQuickPick(
          bibleIds,
          {
              placeHolder: "Select the bibleId",
          }
        );
        window.showInformationMessage(`Bible selected ${targetBibleIdPick}`);

        return {
            catalog,
            gwLanguagePick,
            gwOwnerPick,
            targetLanguagePick,
            targetOwnerPick,
            targetBibleIdPick,
        }
    }

    private static async getGatewayLangOptions() {
        let catalog = getSavedCatalog();
        try {
            if (!catalog) {
                window.showInformationMessage("Checking DCS for GLs - can take minutes");
                catalog = await getLatestResources(resourcesPath);
                window.showInformationMessage(`Retrieved DCS catalog ${catalog?.length} items`);
            } else {
                window.showInformationMessage(`Using cached DCS catalog ${catalog?.length} items`);
            }
        } catch (e) {
            window.showInformationMessage("failed to retrieve DCS catalog");
        }

        //////////////////////////////////
        // GL language

        const gatewayLanguages = getGatewayLanguages();
        const glChoices = getLanguagePrompts(gatewayLanguages);
        let gwLanguagePick = await vscode.window.showQuickPick(
          glChoices,
          {
              placeHolder: "Select the gateway checking language",
          },
        );
        // @ts-ignore
        gwLanguagePick = getLanguageCodeFromPrompts(gwLanguagePick) || "en";
        window.showInformationMessage(`GL checking language selected ${gwLanguagePick}`);

        const owners = findOwnersForLang(catalog || [], gwLanguagePick);
        const gwOwnerPick = await vscode.window.showQuickPick(
          owners,
          {
              placeHolder: "Select the gateway checking organization",
          },
        );
        window.showInformationMessage(`GL checking owner selected ${gwOwnerPick}`);
        return {
            catalog,
            gwLanguagePick,
            gwOwnerPick
        };
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
