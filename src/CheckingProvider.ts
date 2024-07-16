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
    getRepoPath,
    getResourceIdsInCatalog,
    getSavedCatalog,
    initProject,
  isRepoInitialized,
    resourcesPath,
    saveCatalog,
} from "./utilities/checkerFileUtils";
import * as path from 'path';
// @ts-ignore
import { loadResources } from "./utilities/checkingServerUtils";
import * as vscode from "vscode";
import {
    getGatewayLanguages,
    getLanguageCodeFromPrompts,
    getLanguagePrompts
} from "./utilities/languages";
// @ts-ignore
var isEqual = require('deep-equal');


type CommandToFunctionMap = Record<string, (text: string, data:{}) => void>;

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

                let projectPath
                let repoFolderExists_ = false
                const workspaceFolder = vscode.workspace.workspaceFolders
                  ? vscode.workspace.workspaceFolders[0]
                  : undefined;
                if (workspaceFolder) {
                    projectPath = workspaceFolder.uri.path
                    repoFolderExists_ = await vscode.workspace.fs.stat(workspaceFolder.uri).then(
                      () => true,
                      () => false
                    );
                }
                
                if (!repoFolderExists_) {
                    const options = await CheckingProvider.getCheckingOptions();
                    if (options && options.gwLanguagePick && options.gwOwnerPick) {
                        const {
                            catalog,
                            gwLanguagePick: glLanguageId,
                            gwOwnerPick: glOwner,
                            targetLanguagePick: targetLanguageId,
                            targetOwnerPick: targetOwner,
                            targetBibleIdPick: targetBibleId,
                        } = options;
                        let {
                            repoInitSuccess,
                            repoPath,
                        } = await this.doRepoInitAll(targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog);

                        if (repoInitSuccess) {
                            const uri = vscode.Uri.file(repoPath);
                            vscode.commands.executeCommand('vscode.openFolder', uri);
                        } else {
                            window.showErrorMessage(`repo init failed!`);
                        }
                    } else {
                        window.showErrorMessage(`Options invalid: ${options}`);
                    }
                }
                else {
                    let results
                    if (projectPath) {
                        results = isRepoInitialized(projectPath, resourcesPath, null)
                        // @ts-ignore
                        const initBibleRepo = results.repoExists && results.manifest?.dublin_core && !results.metaDataInitialized
                            && !results.checksInitialized && results.bibleBooksLoaded
                        if (initBibleRepo) {
                            // @ts-ignore
                            const dublin_core = results.manifest?.dublin_core
                            const targetLanguageId = dublin_core?.language?.identifier
                            const targetBibleId = dublin_core?.identifier
                            const targetOwner = ''

                            const options = await CheckingProvider.getGatewayLangOptions();
                            if (!(options && options.gwLanguagePick && options.gwOwnerPick)) {
                                window.showErrorMessage(`Options invalid: ${options}`);
                                return null
                            }

                            const {
                                catalog,
                                gwLanguagePick: glLanguageId,
                                gwOwnerPick: glOwner
                            } = options;

                            const repoInitSuccess = await this.doRepoInit(projectPath, targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog);
                            if (repoInitSuccess) {
                                window.showInformationMessage(`Checking has been set up in project`);
                            } else {
                                window.showErrorMessage(`repo init failed!`);
                            }
                        } else if (results.repoExists) {
                            window.showErrorMessage(`repo already has broken setup!`);
                        }
                    } else {
                        window.showErrorMessage(`repo already exists!`);
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

    private static async doRepoInitAll(targetLanguageId: string, targetBibleId: string | undefined, glLanguageId: string, targetOwner: string | undefined, glOwner: string | undefined, catalog: object[] | null) {
        let repoInitSuccess = false;
        const repoPath = getRepoPath(targetLanguageId, targetBibleId || "", glLanguageId);
        const repoExists = fileExists(repoPath);
        if (!repoExists) {
            repoInitSuccess = await CheckingProvider.doRepoInit(repoPath, targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog);
        } else {
            window.showErrorMessage(`Cannot create project, folder already exists at ${repoPath}`);
        }
        return { repoInitSuccess, repoPath };
    }

    private static async doRepoInit(repoPath: string, targetLanguageId: string, targetBibleId: string | undefined, glLanguageId: string, targetOwner: string | undefined, glOwner: string | undefined, catalog: object[] | null) {
        let repoInitSuccess = false;
        window.showInformationMessage(`Initializing project which can take a while if resources have to be downloaded, at ${repoPath}`);
        const {
            success,
            errorMsg,
        } = await initProject(repoPath, targetLanguageId, targetOwner || "", targetBibleId || "", glLanguageId, glOwner || "", resourcesPath, null, catalog);
        if (success) {
            window.showInformationMessage(`Initialized project at ${repoPath}`);
            repoInitSuccess = true;
        } else {
            window.showErrorMessage(errorMsg);
            window.showErrorMessage(`Failed to initialize project at ${repoPath}`);
        }
        return repoInitSuccess;
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

        const saveSelection = (text:string, newState:{}) => {
            // @ts-ignore
            const selections = newState && newState.selections
            console.log(`saveSelection - new selections`, selections)
            // @ts-ignore
            const currentContextId = newState && newState.currentContextId
            console.log(`saveSelection - current context data`, currentContextId)
            // @ts-ignore
            const checkingData = newState && newState.currentCheckingData

            let checks = document.getText();
            if (checks.trim().length) {
                const checkingData = JSON.parse(checks);
                let foundCheck = this.findCheckToUpdate(currentContextId, checkingData);

                if (foundCheck) {
                    console.log(`saveSelection - found match`, foundCheck);
                    // @ts-ignore
                    foundCheck.selections = selections
                    this.updateChecks(document, checkingData) // save with updated
                }
            }
        };

        const messageEventHandlers = (message: any) => {
            const { command, text, data } = message;

            const commandToFunctionMapping: CommandToFunctionMap = {
                ["loaded"]: updateWebview,
                ["saveSelection"]: saveSelection,
            };

            commandToFunctionMapping[command](text, data);
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

    private findCheckToUpdate(currentContextId:{}, checkingData:{}) {
        let foundCheck;
        if (currentContextId && checkingData) {
            // @ts-ignore
            const _checkId = currentContextId?.checkId;
            // @ts-ignore
            const _groupId = currentContextId?.groupId;
            // @ts-ignore
            const _quote = currentContextId?.quote;
            // @ts-ignore
            const _occurrence = currentContextId?.occurrence;
            // @ts-ignore
            const _reference = currentContextId?.reference;
            for (const groupId of Object.keys(checkingData)) {
                if (groupId === 'manifest') { // skip over manifest
                    continue
                }
                // @ts-ignore
                const groups = checkingData[groupId]?.groups || {};
                for (const checkId of Object.keys(groups)) {
                    const checks: object[] = groups[checkId];
                    foundCheck = checks.find(item => {
                        // @ts-ignore
                        const contextId = item?.contextId;
                        // @ts-ignore
                        if ((_checkId === contextId?.checkId) && (_groupId === contextId?.groupId)) {
                            if (isEqual(_reference, contextId?.reference)) {
                                if (isEqual(_quote, contextId?.quote) && (_occurrence === contextId?.occurrence)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    });

                    if (foundCheck) {
                        break;
                    }
                }

                if (foundCheck) {
                    break;
                }
            }
        }

        if(!foundCheck) {
            console.warn(`findCheckToUpdate - check not found`, currentContextId)
        }
        return foundCheck;
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

    private updateChecks(document: TextDocument, checkingData:object) {
        const newDocumentText = JSON.stringify(checkingData, null, 2)

        const edit = new vscode.WorkspaceEdit();

        // Just replace the entire document every time for this example extension.
        // A more complete extension should compute minimal edits instead.
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          newDocumentText);

        return vscode.workspace.applyEdit(edit);
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
                // @ts-ignore
                saveCatalog(catalog);
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
