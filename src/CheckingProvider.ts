import * as vscode from "vscode";
import {
    CancellationToken,
    commands,
    CustomTextEditorProvider,
    Disposable,
    ExtensionContext,
    TextDocument,
    WebviewPanel,
    window,
    workspace,
} from "vscode";
// @ts-ignore
import * as fs from "fs-extra";

import { TranslationCheckingPanel } from "./panels/TranslationCheckingPanel";
import { ResourcesObject, TranslationCheckingPostMessages } from "../types";
import {
    cleanUpFailedCheck,
    delay,
    fileExists,
    findBibleResources,
    findOwnersForLang,
    findResourcesForLangAndOwner,
    getBookForTestament,
    getLanguagesInCatalog,
    getLatestResources,
    getRepoPath,
    getResourceIdsInCatalog,
    getResourcesForChecking,
    getSavedCatalog,
    initProject,
    isRepoInitialized,
    resourcesPath,
    saveCatalog,
} from "./utilities/checkerFileUtils";
// @ts-ignore
import { loadResources } from "./utilities/checkingServerUtils";
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

async function showInformationMessage(message: string, modal: boolean = false, detail: null|string = null) {
    if (modal) {
        const options = { modal: true };
        if (detail) {
            // @ts-ignore
            options.detail = detail;
        }
        window.showInformationMessage(message, options);
    } else {
        window.showInformationMessage(message);
    }
    console.log(message)
    await delay(200); // TRICKY: allows UI to update before moving on
}

async function showErrorMessage(message: string, modal: boolean = false, detail: null|string = null) {
    if (modal) {
        const options = { modal: true };
        if (detail) {
            // @ts-ignore
            options.detail = detail;
        }
        window.showErrorMessage(message, options);
    } else {
        window.showErrorMessage(message);
    }
    console.error(message)
    await delay(200); // TRICKY: allows UI to update before moving on
}

/**
 * Provider for tsv editors.
 *
 * Checking Editors are used for .tn_check and .twl_check files. This editor is specifically geared
 * making selections in the target language and saving them in the check file.
 *
 */
export class CheckingProvider implements CustomTextEditorProvider {
    public static createNewFolder = false

    public static register(context: ExtensionContext):Disposable[]
    {
        const subscriptions = []
        const provider = new CheckingProvider(context);
        const providerRegistration = window.registerCustomEditorProvider(
            CheckingProvider.viewType,
            provider,
        );
        subscriptions.push(providerRegistration)

        let commandRegistration = commands.registerCommand(
          "checking-extension.initTranslationChecker",
          async (verseRef: string) => {
              return await CheckingProvider.initializeChecker();
          },
        );
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.launchWorkflow",
          async (verseRef: string) => {
              vscode.window.showInformationMessage('Launching Checking Workflow');
              const { projectPath, repoFolderExists } = await CheckingProvider.getWorkSpaceFolder();
              if (repoFolderExists) {
                  await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, `unfoldingWord.checking-extension#initChecking`, false);
              } else {
                  CheckingProvider.createNewFolder = true
                  await CheckingProvider.gotoWorkFlow('selectGatewayLanguage')
              }
          },
        );
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.createNewFolder",
          async (verseRef: string) => {
              CheckingProvider.createNewFolder = true
              await CheckingProvider.gotoWorkFlow('selectGatewayLanguage')
          },
        );
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.selectFolder",
          async (verseRef: string) => {
              CheckingProvider.createNewFolder = false
              await CheckingProvider.openWorkspace()
              await CheckingProvider.gotoWorkFlow('selectGatewayLanguage')
          },
        );
        subscriptions.push(commandRegistration)

        return subscriptions;
    }

    private static async gotoWorkFlow(step:string) {
        await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, 
          {
              category: `unfoldingWord.checking-extension#initChecking`,
              step: `unfoldingWord.checking-extension#initChecking#${step}`,
          },
          false
        );
    }

    private static async openWorkspace() {
        let workspaceFolder;
        const openFolder = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: "Choose project folder",
        });
        if (openFolder && openFolder.length > 0) {
            await vscode.commands.executeCommand(
              "vscode.openFolder",
              openFolder[0],
              false
            );
            workspaceFolder = vscode.workspace.workspaceFolders
              ? vscode.workspace.workspaceFolders[0]
              : undefined;
        }
        if (!workspaceFolder) {
            return;
        }
    }
    
    private static async initializeChecker(navigateToFolder = false) {
        await showInformationMessage("initializing Checker");
        const { projectPath, repoFolderExists } = await CheckingProvider.getWorkSpaceFolder();

        if (!repoFolderExists) {
            await this.initializeEmptyFolder();
        } else {
            let results;
            if (projectPath) {
                results = isRepoInitialized(projectPath, resourcesPath, null);
                // @ts-ignore
                const isValidBible = results.repoExists && results.manifest?.dublin_core;
                const initBibleRepo = isValidBible && !results.metaDataInitialized
                  && !results.checksInitialized && results.bibleBooksLoaded;
                if (initBibleRepo) {
                    return await this.initializeBibleFolder(results, projectPath);
                } else if (results.repoExists) {
                    if (results.metaDataInitialized && results.checksInitialized) {
                        return await showErrorMessage(`repo already has checking setup!`, true);
                    } else {
                        
                    }
                }
            } else {
                await showErrorMessage(`repo already exists!`, true);
            }
        }
        await showErrorMessage(`repo already exists - but not valid!`, true);
    }

    private static async getWorkSpaceFolder() {
        let projectPath;
        let repoFolderExists = false;
        const workspaceFolder = vscode.workspace.workspaceFolders
          ? vscode.workspace.workspaceFolders[0]
          : undefined;
        if (workspaceFolder) {
            projectPath = workspaceFolder.uri.fsPath;
            repoFolderExists = await vscode.workspace.fs.stat(workspaceFolder.uri).then(
              () => true,
              () => false,
            );
        }
        return { projectPath, repoFolderExists };
    }

    private static async initializeBibleFolder(results:object, projectPath:string) {
        // @ts-ignore
        const dublin_core = results.manifest?.dublin_core;
        const targetLanguageId = dublin_core?.language?.identifier;
        const targetBibleId = dublin_core?.identifier;
        const targetOwner = "";

        const options = await CheckingProvider.getGatewayLangOptions();
        if (!(options && options.gwLanguagePick && options.gwOwnerPick)) {
            await showErrorMessage(`Options invalid: ${options}`, true);
            return null;
        }

        const {
            catalog,
            gwLanguagePick: glLanguageId,
            gwOwnerPick: glOwner,
        } = options;

        const repoInitSuccess = await this.doRepoInit(projectPath, targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog);
        if (repoInitSuccess) {
            await showInformationMessage(`Checking has been set up in project`);
        } else {
            await showErrorMessage(`repo init failed!`, true);
        }
    }

    private static async initializeEmptyFolder() {
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

            let navigateToFolder = repoInitSuccess;
            if (!repoInitSuccess) {
                await showErrorMessage(`repo init failed!`, true);
                // const repoExists = fileExists(repoPath)
                // if (repoExists) {
                //     navigateToFolder = true // if we created the folder, even if it failed to add checks, navigate to it
                // }
            }

            if (navigateToFolder) {
                const uri = vscode.Uri.file(repoPath);
                vscode.commands.executeCommand("vscode.openFolder", uri);
            }
        } else {
            await showErrorMessage(`Options invalid: ${options}`, true);
        }
    }

    private static async doRepoInitAll(targetLanguageId: string, targetBibleId: string | undefined, glLanguageId: string, targetOwner: string | undefined, glOwner: string | undefined, catalog: object[] | null) {
        let repoInitSuccess = false;
        const repoPath = getRepoPath(targetLanguageId, targetBibleId || "", glLanguageId);
        const repoExists = fileExists(repoPath);
        if (!repoExists) {
            if (targetLanguageId && targetBibleId && targetOwner) {
                repoInitSuccess = await CheckingProvider.doRepoInit(repoPath, targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog);
            } else {
                await showErrorMessage(`Cannot create project, target language not selected ${{ targetLanguageId, targetBibleId, targetOwner }}`, true);
            }
        } else {
            await showErrorMessage(`Cannot create project, folder already exists at ${repoPath}`, true);
        }
        return { repoInitSuccess, repoPath };
    }

    private static async doRepoInit(repoPath: string, targetLanguageId: string, targetBibleId: string | undefined, glLanguageId: string, targetOwner: string | undefined, glOwner: string | undefined, catalog: object[] | null) {
        let repoInitSuccess = false;

        if (glLanguageId && glOwner) {
            await showInformationMessage(`Initializing project which can take a while if resources have to be downloaded, at ${repoPath}`);
            // @ts-ignore
            const results = await this.initProjectWithProgress(repoPath, targetLanguageId, targetOwner, targetBibleId, glLanguageId, glOwner, catalog);
            // @ts-ignore
            if (results.success) {
                let validResources = true
                let missingMessage = ''

                // verify that we have the necessary resources
                for (const projectId of ['twl', 'tn']) {
                    for (const isNT of [false, true]) {
                        const _bookId = getBookForTestament(repoPath, isNT);
                        if (_bookId) {
                            const _resources = getResourcesForChecking(repoPath, resourcesPath, projectId, _bookId);
                            // @ts-ignore
                            if (!_resources.validResources) {
                                const testament = isNT ? 'NT' : 'OT'
                                const message = `Missing ${projectId} needed ${testament} resources`;
                                // @ts-ignore
                                missingMessage = missingMessage + `${message}\n${_resources.errorMessage}\n`
                                validResources = false;
                            }
                        }
                    }
                }

                if (validResources) {
                    repoInitSuccess = true;
                    await showInformationMessage(`Successfully initialized project at ${repoPath}`, true, 'You can now do checking by opening translationWords checks in `checking/twl` or translationNotes checks in `checking/tn`');
                } else {
                    await showErrorMessage(`Missing resources resources at ${repoPath}`, true, missingMessage );
                }
            } else {
                // @ts-ignore
                await showErrorMessage(results.errorMsg);
                await showErrorMessage(`Failed to initialize project at ${repoPath}`, true);
            }
            if (!repoInitSuccess) {
                console.log(`updateProgress - initialization failed - cleaning up`)
                cleanUpFailedCheck(repoPath)
            }
        } else {
            await showErrorMessage(`Cannot create project, gateway language not selected ${{ glLanguageId, glOwner }}`, true);
        }
        return repoInitSuccess;
    }

    private static async initProjectWithProgress(repoPath: string, targetLanguageId: string, targetOwner: string | undefined, targetBibleId: string | undefined, glLanguageId: string, glOwner: string | undefined, catalog: object[] | null):Promise<object> {
        const increment = 5;
        const promise = new Promise<object>((resolve) => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                // this will show progress bar, but times out
                // location: vscode.ProgressLocation.Notification,
                title: 'Downloading GL resources...',
                cancellable: false
            }, async (progressTracker) => {
                async function updateProgress(message:string) {
                    console.log(`updateProgress - ${message}`)
                    progressTracker.report({  increment });
                    // await showInformationMessage(message);
                    await delay(200)
                }

                progressTracker.report({ increment });
                await delay(100)
                const results = await initProject(repoPath, targetLanguageId, targetOwner || "", targetBibleId || "", glLanguageId, glOwner || "", resourcesPath, null, catalog, updateProgress);
                progressTracker.report({ increment });
                await delay(100)
                resolve(results)
            })
        })
        return promise
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
        const assetsPath = vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui/build/assets');
        this.fixCSS(assetsPath);

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
              this.context.extensionUri,
              assetsPath,
            ],
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

    /**
     * open.css file and fix paths to assets.
     * @param assetsPath
     * @private
     */
    private fixCSS(assetsPath: vscode.Uri) {
        console.log(`fixCSS - assetsPath`, assetsPath.fsPath);
        const buildPath = vscode.Uri.joinPath(assetsPath, '..')
        const cssPath = vscode.Uri.joinPath(assetsPath, "index.css");
        console.log(`fixCSS - cssPath.path`, cssPath.path);
        console.log(`fixCSS - cssPath.fsPath`, cssPath.fsPath);
        try {
            let count = 0
            const data = fs.readFileSync(cssPath.fsPath, "UTF-8")?.toString() || '';
            console.log(`data.length`, data?.length);
            const parts = data.split('url(')
            if (parts.length > 1) {
                // iterate through each URL
                for (let i = 1; i < parts.length; i++) {
                    let part = parts[i]
                    const pathParts = part.split(')')
                    // for asset times replay with absolute path to work with vscode
                    if (pathParts[0].substring(0, 7) === "/assets") {
                        count++
                        console.log(`fixCSS - found ${pathParts[0]}`);
                        let newUrlPath = vscode.Uri.joinPath(buildPath, pathParts[0]);
                        let newUrlFsPath = newUrlPath.fsPath.replaceAll('\\', '/')
                        console.log(`fixCSS - found ${pathParts[0]} and changed to new newUrlFsPath - ${newUrlFsPath}`);
                        // replace asset path with absolute path
                        pathParts[0] = newUrlFsPath
                        const joinedStr = pathParts.join(')')
                        parts[i] = joinedStr
                    } else {
                        console.log(`fixCSS - not 'url(/assets' to convert ${pathParts}`);
                    }
                }
            }
            
            if (count) {
                const newCss = parts.join('url(')
                fs.outputFileSync(cssPath.fsPath, newCss, 'UTF-8');
            }
        } catch (e) {
            console.error(`fixCSS - cannot fix index.css at ${cssPath}`, e)
        }
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
        await showInformationMessage(`Target language selected ${targetLanguagePick}`);

        const targetOwners = findOwnersForLang(catalog || [], targetLanguagePick)
        const targetOwnerPick = await vscode.window.showQuickPick(
          targetOwners,
          {
              placeHolder: "Select the target organization",
          }
        );
        await showInformationMessage(`Target owner selected ${targetOwnerPick}`);

        const resources = findResourcesForLangAndOwner(catalog || [], targetLanguagePick, targetOwnerPick || '')
        const bibles = findBibleResources(resources || [])
        const bibleIds = getResourceIdsInCatalog(bibles || [])
        const targetBibleIdPick = await vscode.window.showQuickPick(
          bibleIds,
          {
              placeHolder: "Select the bibleId",
          }
        );
        await showInformationMessage(`Bible selected ${targetBibleIdPick}`);

        return {
            catalog,
            gwLanguagePick,
            gwOwnerPick,
            targetLanguagePick,
            targetOwnerPick,
            targetBibleIdPick,
        }
    }

    private static getDoor43ResourcesWithProgress(resourcesPath:string) {
        return new Promise((resolve) => {
            window.showInformationMessage("Checking DCS for GLs - can take minutes");
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading Catalog...',
                cancellable: false
            }, async (progressTracker) => {
                async function updateProgress(message: string) {
                    console.log(`updateProgress - ${message}`)
                    progressTracker.report({ increment: 50 });
                    await delay(100)
                }

                progressTracker.report({ increment: 25 });
                await delay(100)
                const catalog = await getLatestResources(resourcesPath)
                progressTracker.report({ increment: 10 });
                await delay(100)
                resolve(catalog)
            })
       });
    }

    private static async getGatewayLangOptions() {
        let catalog = getSavedCatalog();
        try {
            if (!catalog) {
                await showInformationMessage("Checking DCS for GLs - can take minutes");
                // @ts-ignore
                catalog = await this.getDoor43ResourcesWithProgress(resourcesPath);
                // @ts-ignore
                saveCatalog(catalog);
                await showInformationMessage(`Retrieved DCS catalog ${catalog?.length} items`);
            } else {
                await showInformationMessage(`Using cached DCS catalog ${catalog?.length} items`);
            }
        } catch (e) {
            await showInformationMessage("failed to retrieve DCS catalog");
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
        await showInformationMessage(`GL checking language selected ${gwLanguagePick}`);

        const owners = findOwnersForLang(catalog || [], gwLanguagePick);
        const gwOwnerPick = await vscode.window.showQuickPick(
          owners,
          {
              placeHolder: "Select the gateway checking organization",
          },
        );
        await showInformationMessage(`GL checking owner selected ${gwOwnerPick}`);
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
