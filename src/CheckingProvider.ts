import * as vscode from "vscode";
import {
    CancellationToken,
    commands,
    CustomTextEditorProvider,
    Disposable,
    ExtensionContext,
    SecretStorage,
    TextDocument,
    WebviewPanel,
    window,
    workspace,
} from "vscode";
// @ts-ignore
import * as fs from "fs-extra";

import { TranslationCheckingPanel } from "./panels/TranslationCheckingPanel";
import { RepoSelection, ResourcesObject, TranslationCheckingPostMessages } from "../types";
import {
    changeTargetVerse,
    cleanUpFailedCheck,
    downloadLatestLangHelpsResourcesFromCatalog,
    downloadTargetBible,
    fetchBibleManifest,
    findBibleResources,
    findOwnersForLang,
    findResourcesForLangAndOwner,
    getBookForTestament,
    getBookIdFromPath,
    getLanguagesInCatalog,
    getLatestResourcesCatalog,
    getMetaData,
    getRepoPath,
    getResourceIdsInCatalog,
    getResourcesForChecking,
    getSavedCatalog,
    getServer,
    initProject,
    isRepoInitialized,
    loadResources,
    removeHomePath,
    resourcesPath,
    saveCatalog,
} from "./utilities/resourceUtils";
import {
    delay,
    fileExists
} from "./utilities/fileUtils";
import {
    DEFAULT_LOCALE,
    getCurrentLanguageCode,
    LOCALE_KEY,
    setLocale,
} from "./utilities/languages";
import {
    getGatewayLanguages,
    getLanguageCodeFromPrompts,
    getLanguagePrompts
} from "./utilities/languages";
// @ts-ignore
import isEqual from 'deep-equal'
import { isNT } from "./utilities/BooksOfTheBible";
import {
    downloadRepoFromDCS,
    getOwnerReposFromRepoList,
    getOwnersFromRepoList,
    getRepoName,
    uploadRepoToDCS,
} from "./utilities/network";
import { getCheckingRepos } from "./utilities/gitUtils";

type CommandToFunctionMap = Record<string, (text: string, data:{}) => void>;

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
    await delay(100); // TRICKY: allows UI to update before moving on
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
    await delay(100); // TRICKY: allows UI to update before moving on
}

async function getWorkSpaceFolder() {
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


/**
 * Provider for tsv editors.
 *
 * Checking Editors are used for .tn_check and .twl_check files. This editor is specifically geared
 * making selections in the target language and saving them in the check file.
 *
 */
export class CheckingProvider implements CustomTextEditorProvider {

    public static currentState = {}
    public static secretStorage:SecretStorage|null = null
    
    constructor(private readonly context: ExtensionContext) {}

    public static register(context: ExtensionContext):Disposable[]
    {
        let redirecting = false;
        let commandRegistration = null;

        //wrapper for registered commands, to prevent recursive calls
        const executeWithRedirecting = (
          command: (...args: any[]) => Promise<void>
        ) => {
            return async (...args: any[]) => {
                if (redirecting) {
                    return;
                }
                redirecting = true;
                try {
                    await command(...args);
                } finally {
                    redirecting = false;
                }
            };
        };
        
        const subscriptions = []
        const provider = new CheckingProvider(context);
        const providerRegistration = window.registerCustomEditorProvider(
            CheckingProvider.viewType,
            provider,
        );
        subscriptions.push(providerRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.launchWorkflow",
          executeWithRedirecting(async () => {
              console.log(`starting "checking-extension.launchWorkflow"`)

              await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, `unfoldingWord.checking-extension#initChecking`, false);
              await this.initializeWorkflow(false);

              const catalog = getSavedCatalog(false)
              if (catalog) {
                  await this.gotoWorkFlowStep('selectTargetBible')
                  await this.setContext('fetchedCatalog', true);
              }
              await this.setContext('createNewFolder', true);
          },
        ));
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.launchWorkflowPre",
          executeWithRedirecting(async () => {
                console.log(`starting "checking-extension.launchWorkflowPre - using PreRelease Resources"`)

                await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, `unfoldingWord.checking-extension#initChecking`, false);
                await this.initializeWorkflow(true);

                const catalog = getSavedCatalog(true)
                if (catalog) {
                    await this.gotoWorkFlowStep('selectTargetBible')
                    await this.setContext('fetchedCatalog', true);
                }
                await this.setContext('createNewFolder', true);
            },
          ));
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.useReleased",
          executeWithRedirecting(async () => {
                console.log(`starting "checking-extension.useReleased"`)

                await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, `unfoldingWord.checking-extension#initChecking`, false);
                await this.gotoWorkFlowStep('fetchCatalog')

                await this.setContext("preRelease", false);
                const catalog = getSavedCatalog(false)
                if (catalog) {
                    await this.setContext('fetchedCatalog', true);
                }
            },
          ));
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.downloadCatalog",
          executeWithRedirecting(async () => {
                console.log("checking-extension.downloadCatalog")
                await delay(100)
                const preRelease = this.getContext('preRelease');
                const catalog = await getLatestResourcesCatalog(resourcesPath, preRelease)
                if (!catalog) {
                    showErrorMessage(`Error Downloading Updated Resource Catalog!`, true);
                } else {
                    saveCatalog(catalog, preRelease)
                    await this.gotoWorkFlowStep('selectTargetBible')
                    await this.setContext('fetchedCatalog', true);
                }
            },
          ));
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.selectTargetBible",
          executeWithRedirecting(async () => {
              console.log("checking-extension.selectTargetBible")
              const preRelease = this.getContext('preRelease')
              const catalog = getSavedCatalog(preRelease)
              const { targetLanguagePick, targetOwnerPick, targetBibleIdPick } = await this.getTargetLanguageSelection(catalog);
              if (targetLanguagePick && targetOwnerPick && targetBibleIdPick) {
                  const targetBibleOptions = {
                      languageId: targetLanguagePick,
                      owner: targetOwnerPick,
                      bibleId: targetBibleIdPick
                  }

                  const options = await this.getBookSelection(targetBibleOptions)
                  if (options?.bookPick) {
                      await this.gotoWorkFlowStep("selectGatewayLanguage");
                      await this.setContext('selectedBook', options.bookPick);
                  }
                  await this.setContext('targetBibleOptions', targetBibleOptions);
              }
          })
        );
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.selectGL",
          executeWithRedirecting(async () => {
              console.log("checking-extension.selectGL")
              const preRelease = this.getContext('preRelease')
              const targetOptions = this.getContext('targetBibleOptions') || {};
              const targetLanguageId = targetOptions.languageId;
              const targetBibleId = targetOptions.bibleId || "";
              const targetOwner = targetOptions.owner;
              const bookId = this.getContext('selectedBook');

              if (targetLanguageId && targetBibleId && targetOwner && bookId) {
                  const options = await this.getGatewayLangSelection(preRelease)
                  const glSelected = !!(options && options.gwLanguagePick && options.gwOwnerPick)

                  let glOptions = glSelected ? {
                        languageId: options.gwLanguagePick,
                        owner: options.gwOwnerPick
                    }
                    : null
                  if (glOptions) {
                      const results = await this.loadResourcesWithProgress(glOptions.languageId, glOptions.owner || '', resourcesPath, preRelease, bookId)
                      
                      // @ts-ignore
                      if (results.error) {
                          await showErrorMessage(`Error Downloading Gateway Language resources!`, true);
                      } else {
                          await this.gotoWorkFlowStep("loadTarget");
                          await this.setContext("loadedGlResources", true);
                          await showInformationMessage(`Gateway Language Resources Loaded`, true);
                      }
                      // await this.gotoWorkFlowStep("loadGlResources");
                      await this.setContext('selectedGL', glOptions);
                  }
              } else {
                  await showErrorMessage(`Target Bible has not been selected!`, true);
              }
          },
        ));
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.loadTargetBible",
          async () => {
              console.log("checking-extension.loadTargetBible")
              const bookId = this.getContext('selectedBook');
              const targetOptions = this.getContext('targetBibleOptions');
              if (targetOptions) {
                  const glOptions = this.getContext('selectedGL');
                  const preRelease = this.getContext('preRelease')
                  if (glOptions && glOptions.languageId && glOptions.owner) {
                      const catalog = getSavedCatalog(preRelease) || [];
                      const targetLanguageId = targetOptions.languageId;
                      const targetBibleId = targetOptions.bibleId || "";
                      const targetOwner = targetOptions.owner;
                      const repoPath = getRepoPath(targetLanguageId, targetBibleId, glOptions.languageId);
                      await showInformationMessage(`Downloading Target Bible ${targetOwner}/${targetLanguageId}/${targetBibleId}`);
                      const targetFoundPath = await downloadTargetBible(targetOptions.bibleId, resourcesPath, targetLanguageId, targetOwner, catalog, bookId, 'master');
                      if (targetFoundPath) {
                          console.log(`checking-extension.loadTargetBible - target Bible is at ${targetFoundPath}`)

                          const catalog = getSavedCatalog(preRelease) || []
                          const { repoInitSuccess, repoPath} = await this.doRepoInitAll(targetOptions.languageId, targetOptions.bibleId, glOptions.languageId, targetOptions.owner, glOptions.owner, catalog, bookId, preRelease);
                          await this.setContext("projectInitialized", repoInitSuccess);

                          if (repoInitSuccess) {
                              // navigate to new folder
                              const repoPathUri = vscode.Uri.file(repoPath);
                              await showInformationMessage(`Successfully initialized project at ${repoPath}`, true, 'You can now do checking by opening translationWords checks in `checking/twl` or translationNotes checks in `checking/tn`');
                              vscode.commands.executeCommand("vscode.openFolder", repoPathUri);
                          }
                      } else {
                          await showErrorMessage(`Target Bible Failed to Load`, true);
                      }
                      await this.setContext("targetBibleLoaded", !!targetFoundPath);
                  } else {
                      await showErrorMessage(`You must select Gateway Language Options first`, true);
                  }
              } else {
                  await showErrorMessage(`You must select a Target Bible first`, true);
              }
          },
        );
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.downloadProject",
          executeWithRedirecting(async () => {
              console.log(`starting "checking-extension.downloadProject"`)
              const localRepoPath = await this.downloadCheckingProjectFromDCS()
              if (localRepoPath) {
                  // navigate to new folder
                  const repoPathUri = vscode.Uri.file(localRepoPath);
                  vscode.commands.executeCommand("vscode.openFolder", repoPathUri);
              }
              console.log(`finished "checking-extension.downloadProject success=${!!localRepoPath}"`)
          })
        );
        subscriptions.push(commandRegistration)
        
        return subscriptions;
    }

    private static async initializeWorkflow(preRelease = false) {
        await delay(100);
        await vscode.commands.executeCommand("resetGettingStartedProgress");
        await delay(100);

        // initialize configurations
        const catalog = getSavedCatalog(preRelease);
        await this.setContext("createNewFolder", true);
        await this.setContext("selectedFolder", false);
        await this.setContext("fetchedCatalog", !!catalog);
        await this.setContext("selectedGL", null);
        await this.setContext("loadedGL", false);
        await this.setContext("loadedGlResources", false);
        await this.setContext("targetBibleOptions", null);
        await this.setContext("targetBibleLoaded", false);
        await this.setContext("projectInitialized", false);
        await this.setContext("preRelease", !!preRelease);
        await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, `unfoldingWord.checking-extension#initChecking`, false);
        await delay(100);
    }

    private static setConfiguration(key:string, value:any) {
        vscode.workspace.getConfiguration("checking-extension").update(key, value);
    }

    private static getConfiguration(key:string):any {
        return vscode.workspace.getConfiguration("checking-extension").get(key);
    }

    private static async setContext(key:string, value:any) {
        await vscode.commands.executeCommand('setContext', key, value);
        // @ts-ignore
        this.currentState[key] = value
        await delay(100)
    }

    private static getContext(key:string):any {
        // @ts-ignore
        return this.currentState[key]
    }

    private static async gotoWorkFlowStep(step:string) {
        await delay(100)
        // const _step = `unfoldingWord.checking-extension#${step}`;
        await vscode.commands.executeCommand(`workbench.action.openWalkthrough`, 
          {
              category: `unfoldingWord.checking-extension#initChecking`,
              step,
          },
          false
        );
        await delay(100)
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
        return workspaceFolder
    }

    private static async initializeChecker(navigateToFolder = false) {
        await showInformationMessage("initializing Checker");
        const { projectPath, repoFolderExists } = await getWorkSpaceFolder();

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
            }
        }
        await showErrorMessage(`repo already exists - but not valid!`, true);
    }

    private static async initializeBibleFolder(results:object, projectPath:string, preRelease = false) {
        // @ts-ignore
        const dublin_core = results.manifest?.dublin_core;
        const targetLanguageId = dublin_core?.language?.identifier;
        const targetBibleId = dublin_core?.identifier;
        const targetOwner = "";
        let glLanguageId = ''
        let glOwner = ''
        let catalog = null
        
        // @ts-ignore
        if (results?.glOptions) {
            catalog = getSavedCatalog(preRelease)
            // @ts-ignore
            glLanguageId = results.glOptions.languageId
            // @ts-ignore
            glOwner = results.glOptions.owner
        }
        else {
            const options = await this.getGatewayLangSelection(preRelease);
            if (!(options && options.gwLanguagePick && options.gwOwnerPick)) {
                await showErrorMessage(`Options invalid: ${options}`, true);
                return null;
            }

            catalog = options.catalog
            glLanguageId = options.gwLanguagePick
            glOwner = options.gwOwnerPick
        }
        const repoInitSuccess = await this.doRepoInit(projectPath, targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog, null, preRelease);
        if (repoInitSuccess) {
            await showInformationMessage(`Checking has been set up in project`);
        } else {
            await showErrorMessage(`repo init failed!`, true);
        }
        return repoInitSuccess
    }

    private static async initializeEmptyFolder(preRelease = false) {
        const options = await this.getCheckingOptions();
        if (options && options.gwLanguagePick && options.gwOwnerPick) {
            const {
                catalog,
                gwLanguagePick: glLanguageId,
                gwOwnerPick: glOwner,
                targetLanguagePick: targetLanguageId,
                targetOwnerPick: targetOwner,
                targetBibleIdPick: targetBibleId,
            } = options;
            const {
                repoInitSuccess,
                repoPath,
            } = await this.doRepoInitAll(targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog, null, preRelease);

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
                await vscode.commands.executeCommand("vscode.openFolder", uri);
            }
        } else {
            await showErrorMessage(`Options invalid: ${options}`, true);
        }
    }

    private static async doRepoInitAll(targetLanguageId: string, targetBibleId: string | undefined, glLanguageId: string, targetOwner: string | undefined, glOwner: string | undefined, catalog: object[] | null, bookId:string | null, preRelease = false) {
        let repoInitSuccess = false;
        const repoPath = getRepoPath(targetLanguageId, targetBibleId || "", glLanguageId, undefined, bookId || '');
        const repoExists = fileExists(repoPath);
        if (!repoExists) {
            if (targetLanguageId && targetBibleId && targetOwner) {
                repoInitSuccess = await this.doRepoInit(repoPath, targetLanguageId, targetBibleId, glLanguageId, targetOwner, glOwner, catalog, bookId, preRelease);
            } else {
                await showErrorMessage(`Cannot create project, target language not selected ${{ targetLanguageId, targetBibleId, targetOwner }}`, true);
            }
        } else {
            await showErrorMessage(`Cannot create project, folder already exists at ${repoPath}`, true);
        }
        return { repoInitSuccess, repoPath };
    }

    private static async doRepoInit(repoPath: string, targetLanguageId: string, targetBibleId: string | undefined, glLanguageId: string, targetOwner: string | undefined, glOwner: string | undefined, catalog: object[] | null, bookId:string | null, preRelease = false) {
        let repoInitSuccess = false;

        if (glLanguageId && glOwner) {
            await showInformationMessage(`Initializing project which can take a while if resources have to be downloaded, at ${repoPath}`);
            // @ts-ignore
            const results = await this.initProjectWithProgress(repoPath, targetLanguageId, targetOwner, targetBibleId, glLanguageId, glOwner, catalog, bookId, preRelease);
            // @ts-ignore
            if (results.success) {
                let validResources = true
                let missingMessage = ''

                // verify that we have the necessary resources
                for (const projectId of ['twl', 'tn']) {
                    const OT = false;
                    const NT = true;
                    let testamentsToCheck = [OT, NT];
                    if (bookId) {
                        const _isNT = isNT(bookId)
                        testamentsToCheck = [_isNT];
                    }
                    for (const _isNT of testamentsToCheck) {
                        const _bookId = bookId || getBookForTestament(repoPath, _isNT);
                        if (_bookId) {
                            const _resources = getResourcesForChecking(repoPath, resourcesPath, projectId, _bookId);
                            // @ts-ignore
                            if (!_resources.validResources) {
                                const testament = _isNT ? 'NT' : 'OT'
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

    private static async loadResourcesWithProgress(languageId:string, owner:string, resourcesPath:string, preRelease = false, bookId = ''):Promise<object> {
        const increment = 5;
        const promise = new Promise<object>((resolve) => {
            vscode.window.withProgress({
                // location: vscode.ProgressLocation.Window,

                // this will show progress bar, but times out
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading GL resources...',
                cancellable: false
            }, async (progressTracker) => {
                async function updateProgress(message:string) {
                    console.log(`updateProgress - ${message}`)
                    progressTracker.report({  increment });
                    await showInformationMessage(message);
                    // await delay(200)
                }

                progressTracker.report({ increment });
                await delay(100)
                const catalog = getSavedCatalog(preRelease)

                await delay(100)
                const results = await downloadLatestLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath, updateProgress, preRelease, bookId)

                progressTracker.report({ increment });
                await delay(100)
                resolve(results)
            })
        })
        return promise
    }

    private static async initProjectWithProgress(repoPath: string, targetLanguageId: string, targetOwner: string | undefined, targetBibleId: string | undefined, glLanguageId: string, glOwner: string | undefined, catalog: object[] | null, bookId:string | null, preRelease = false):Promise<object> {
        const increment = 5;
        const promise = new Promise<object>((resolve) => {
            vscode.window.withProgress({
                // location: vscode.ProgressLocation.Window,

                // this will show progress bar, but times out
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading GL resources...',
                cancellable: false
            }, async (progressTracker) => {
                async function updateProgress(message:string) {
                    console.log(`updateProgress - ${message}`)
                    progressTracker.report({  increment });
                    await showInformationMessage(message);
                    // await delay(200)
                }

                progressTracker.report({ increment });
                await delay(100)
                const results = await initProject(repoPath, targetLanguageId, targetOwner || "", targetBibleId || "", glLanguageId, glOwner || "", resourcesPath, null, catalog, updateProgress, bookId || '', preRelease);
                progressTracker.report({ increment });
                await delay(100)
                resolve(results)
            })
        })
        return promise
    }

    private static readonly viewType = "checking-extension.translationChecker";
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

        /**
         * make sure localization is initialized and check for last locale setting
         */
        const initCurrentLocale = async () => {
            if (!getCurrentLanguageCode()) {
                let currentLocale = DEFAULT_LOCALE
                    const secretStorage = getSecretStorage();
                    const value = await secretStorage.get(LOCALE_KEY);
                    if (value) {
                        currentLocale = value
                    }
                
                setLocale(currentLocale)
            }
        }

        /**
         * called whenever source document file path changes or content changes
         * @param firstLoad - true if this is an initial load, otherwise just a change of document content which will by handled by the webview
         */
        const updateWebview = (firstLoad:boolean) => {
            if (firstLoad) { // only update if file location changed
                initCurrentLocale().then(() => { // make sure initialized first
                    webviewPanel.webview.postMessage({
                        command: "update",
                        data: this.getCheckingResources(document),
                    } as TranslationCheckingPostMessages);
                })
            } else {
                console.log(`updateWebview - not first load`)
            }
        };

        const saveCheckingData = (text:string, newState:{}) => {
            // @ts-ignore
            const currentCheck = newState?.currentCheck;
            // @ts-ignore
            const selections =  currentCheck?.selections
            console.log(`saveSelection - new selections`, selections)
            // @ts-ignore
            const currentContextId = currentCheck?.contextId
            console.log(`saveSelection - current context data`, currentContextId)

            let checks = document.getText();
            if (checks.trim().length) {
                const checkingData = JSON.parse(checks);
                let foundCheck = this.findCheckToUpdate(currentContextId, checkingData);
                
                if (foundCheck) {
                    console.log(`saveCheckingData - found match`, foundCheck);
                    // update data in found match
                    // @ts-ignore
                    foundCheck.selections = selections
                    // @ts-ignore
                    foundCheck.reminders = currentCheck?.reminders
                    // @ts-ignore
                    foundCheck.comments = currentCheck?.comments
                    // @ts-ignore
                    foundCheck.nothingToSelect = currentCheck?.nothingToSelect
                    // @ts-ignore
                    foundCheck.verseEdits = currentCheck?.verseEdits
                    this.updateChecks(document, checkingData) // save with updated
                } else {
                    console.error(`saveCheckingData - did not find match`, foundCheck);
                }
            }
        };

        const getSecretStorage = () => {
            if (!CheckingProvider.secretStorage) {
                CheckingProvider.secretStorage = this.context.secrets;
            }

            return CheckingProvider.secretStorage
        }

        const uploadToDCS = (text:string, data:object) => {
            // @ts-ignore
            const token = data?.token as string
            // @ts-ignore
            const owner = data?.owner as string
            // @ts-ignore
            const server = data?.server as string
            const filePath = document.fileName
            const bookId = getBookIdFromPath(filePath) || ''
            delay(100).then(async () => {
                console.log(`uploadToDCS: ${text} - ${owner}`)
                const { projectPath, repoFolderExists } = await getWorkSpaceFolder();
                const metaData = getMetaData(projectPath || '')
                const { targetLanguageId, targetBibleId, gatewayLanguageId, bookId } = metaData?.["translation.checker"]
                const repo = getRepoName(targetLanguageId, targetBibleId, gatewayLanguageId, bookId);
                const results = await uploadRepoToDCS(server, owner, repo, token, projectPath || '')

                // send back value
                webviewPanel.webview.postMessage({
                    command: "uploadToDCSResponse",
                    data: results,
                } as TranslationCheckingPostMessages);
            })
        }
        
        const getSecret = (text:string, data:object) => {
            const _getSecret = async (text:string, key:string) => {
                console.log(`getSecret: ${text}, ${data} - key ${key}`)
                let valueObject: object | undefined;
                const secretStorage = getSecretStorage();
                if (secretStorage && key) {
                    const value = await secretStorage.get(key);
                    valueObject = value && JSON.parse(value)
                }

                // send back value
                webviewPanel.webview.postMessage({
                    command: "getSecretResponse",
                    data: {
                        key,
                        valueObject,
                    },
                } as TranslationCheckingPostMessages);
            }
            // @ts-ignore
            const key:string = data?.key || '';
            _getSecret(text, key)
        }

        const saveSecret = (text:string, data:object) => {
            console.log(`saveSecret: ${text}`)
            const secretStorage = getSecretStorage();
            // @ts-ignore
            const key:string = data?.key || '';
            // @ts-ignore
            const value = data?.value;
            if (secretStorage && key) {
                // @ts-ignore
                const valueObject = value ? JSON.stringify(value) : null
                secretStorage.store(key, valueObject || '');
            }
        }

        const firstLoad = (text:string, data:object) => {
            console.log(`firstLoad: ${text}`)
            updateWebview(true)
        }

        const setLocale_ = (text:string, data:object) => {
            // @ts-ignore
            const value = data?.value || DEFAULT_LOCALE;
            const code = value.split('-').pop()
            console.log(`setLocale: ${text},${value}`)
            setLocale(code)
            // save current locale for next run
            const secretStorage = getSecretStorage();
            secretStorage.store(LOCALE_KEY,code);
            updateWebview(true) // refresh display
        }

        const changeTargetVerse_ = (text:string, data:object) => {
            console.log(`changeTargetVerse: ${data}`)
            // @ts-ignore
            const { bookId, chapter, verse, newVerseText, newVerseObjects } = data

            delay(100).then(async () => {
                const { projectPath, repoFolderExists } = await getWorkSpaceFolder();
                if (repoFolderExists && projectPath) {
                    await changeTargetVerse(projectPath, bookId, chapter, verse, newVerseText, newVerseObjects)
                } else {
                    console.warn (`changeTargetVerse_() projectPath '${projectPath}' does not exist`)
                }
            })
            
        }

        const messageEventHandlers = (message: any) => {
            const { command, text, data } = message;
            // console.log(`messageEventHandlers ${command}: ${text}`)

            const commandToFunctionMapping: CommandToFunctionMap = {
                ["loaded"]: firstLoad,
                ["saveCheckingData"]: saveCheckingData,
                ["getSecret"]: getSecret,
                ["saveSecret"]: saveSecret,
                ["setLocale"]: setLocale_,
                ["changeTargetVerse"]: changeTargetVerse_,
                ["uploadToDCS"]: uploadToDCS,
            };

            const commandFunction = commandToFunctionMapping[command];
            if (commandFunction) {
                commandFunction(text, data);
            } else {
                console.error(`Command ${command}: ${text} has no handler`)
            }
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
                    updateWebview(false);
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

    /**
     * search checkingData for check that matches currentContextId and return location within checkingData
     * @param currentContextId
     * @param checkingData
     */
    private findCheckToUpdate(currentContextId:{}, checkingData:{}) {
        let foundCheck:null|object = null;
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
            for (const catagoryId of Object.keys(checkingData)) {
                if (catagoryId === 'manifest') { // skip over manifest
                    continue
                }
                // @ts-ignore
                const groups = checkingData[catagoryId]?.groups || {};
                const desiredGroup = groups[_groupId]
                
                if (!desiredGroup) continue // if desired group is not in this category, then skip to next category
                
                const checks: object[] = desiredGroup;
                const index = checks.findIndex(item => {
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

                if (index >= 0) {
                    foundCheck = checks[index]
                    break;
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
                "getCheckingResources - Could not get document as json. Content is not valid check file in json format",
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
        const options = await this.getGatewayLangSelection();
        if (!options) {
            return null
        }

        const {
            catalog,
            gwLanguagePick,
            gwOwnerPick
        } = options;
        let { targetLanguagePick, targetOwnerPick, targetBibleIdPick } = await this.getTargetLanguageSelection(catalog);

        return {
            catalog,
            gwLanguagePick,
            gwOwnerPick,
            targetLanguagePick,
            targetOwnerPick,
            targetBibleIdPick,
        }
    }

    private static async getTargetLanguageSelection(catalog: object[] | null) {
        //////////////////////////////////
        // Target language

        // @ts-ignore
        const targetLangChoices = getLanguagePrompts(getLanguagesInCatalog(catalog))
        let targetLanguagePick = await vscode.window.showQuickPick(
          targetLangChoices,
          {
              placeHolder: "Select the target language:",
          }
        );
        // @ts-ignore
        targetLanguagePick = getLanguageCodeFromPrompts(targetLanguagePick) || 'en'
        await showInformationMessage(`Target language selected ${targetLanguagePick}`);

        const targetOwners = findOwnersForLang(catalog || [], targetLanguagePick)
        const targetOwnerPick = await vscode.window.showQuickPick(
          targetOwners,
          {
              placeHolder: "Select the target organization:",
          }
        );
        await showInformationMessage(`Target owner selected ${targetOwnerPick}`);

        const resources = findResourcesForLangAndOwner(catalog || [], targetLanguagePick, targetOwnerPick || '')
        const bibles = findBibleResources(resources || [])
        const bibleIds = getResourceIdsInCatalog(bibles || [])
        const targetBibleIdPick = await vscode.window.showQuickPick(
          bibleIds,
          {
              placeHolder: "Select the target Bible ID:",
          }
        );
        await showInformationMessage(`Bible selected ${targetBibleIdPick}`);
        return { targetLanguagePick, targetOwnerPick, targetBibleIdPick };
    }

    private static async downloadCheckingProjectFromDCS(): Promise<string> {
        await showInformationMessage(`Searching for Checking Projects on server`);
        
        const server = getServer();
        const results = await getCheckingRepos(server)
        const repos = results?.repos || [];
        
        let repoPick:string = ''

        const ownerNames = getOwnersFromRepoList(repos);
        console.log(`ownerNames length ${ownerNames?.length}`, ownerNames)

        if (!ownerNames?.length) {
            await showInformationMessage(`No Owners found on ${server}`, true, `No Owners found on ${server}.  Check with your network Administrator`);
            return ''
        }
        
        let ownerPick = await vscode.window.showQuickPick(
          ownerNames,
          {
              placeHolder: "Select the owner for Project download:",
          }
        );
        
        if (ownerPick) {
            await showInformationMessage(`Owner selected ${ownerPick}`);

            const filteredRepos = getOwnerReposFromRepoList(repos, ownerPick)
            const repoNames = filteredRepos.map(repo => repo.name).sort()

            console.log(`repoNames length ${repoNames?.length}`, repoNames)
            
            if (!repoNames?.length) {
                await showInformationMessage(`No Checking repos found on ${server}/${ownerPick}`, true, `No Checking repos found on ${server}/${ownerPick}. Try a different owner`);
                return ''
            }

            repoPick = await vscode.window.showQuickPick(
              repoNames,
              {
                  placeHolder: "Select the repo for Project download:",
              }
            ) || '';
            
            if (repoPick) {
                await showInformationMessage(`Repo selected ${repoPick}`);
                let success = false
                let madeBackup = false

                delay(5000).then(() => {
                    showInformationMessage(`Downloading ${ownerPick}/${repoPick} from server`);
                })

                let results = await downloadRepoFromDCS(server || '', ownerPick || '', repoPick || '', false)
                if (results.error) {
                    if (results.errorLocalProjectExists) {
                        const backupOption = 'Backup Current Repo and Download'
                        const response = await vscode.window.showWarningMessage(
                          'There is already a project with the same name on your computer.  What do you want to do?',
                          { modal: true },
                          backupOption,
                        );
                        console.log('User selected:', response);
                        
                        if (response !== backupOption) {
                            return ''
                        }

                        madeBackup = true
                        await showInformationMessage(`Downloading Checking Project ${ownerPick}/${repoPick} from server`);
                        
                        results = await downloadRepoFromDCS(server || '', ownerPick || '', repoPick || '', true)
                        if (!results.error) {
                            success = true
                        }
                    }
                } else {
                    success = true
                }

                if (!success) {
                    await showErrorMessage(`Could not download repo ${ownerPick}/${repoPick}`, true)
                } else {
                    const _backupRepoPath = removeHomePath(results?.backupRepoPath);
                    const _localRepoPath = removeHomePath(results?.localRepoPath);
                    const detail = madeBackup ? `The existing project was moved to ${_backupRepoPath}.` : ''
                    await showInformationMessage(`Project successfully downloaded to ${_localRepoPath}.`, true, detail);
                    return results?.localRepoPath || ''
                }
            }
        }
        
        return '';
    }

    private static getDoor43ResourcesCatalogWithProgress(resourcesPath:string, preRelease = false) {
        return new Promise((resolve) => {
            window.showInformationMessage("Checking DCS for GLs - can take minutes");
            vscode.window.withProgress({
                // location: vscode.ProgressLocation.Notification,
                // this will show progress bar, but times out
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
                const catalog = await getLatestResourcesCatalog(resourcesPath, preRelease)
                progressTracker.report({ increment: 10 });
                await delay(100)
                resolve(catalog)
            })
       });
    }

    private static async checkWorkspace( ) {
        let repoExists = false
        let isValidBible = false
        let isCheckingInitialized = true
        const { projectPath, repoFolderExists } = await getWorkSpaceFolder();
        if (repoFolderExists && projectPath) {
            repoExists = true
            const results = isRepoInitialized(projectPath, resourcesPath, null);
            // @ts-ignore
            isValidBible = results.repoExists && results.manifest?.dublin_core && results.bibleBooksLoaded;
            isCheckingInitialized = isValidBible && results.metaDataInitialized && results.checksInitialized;
        }
        return {
            repoExists,
            isValidBible,
            isCheckingInitialized,
            repoFolderExists,
            projectPath
        }
    }

    private static async promptUpdateSpecificFolder( ) {
        const choices = {
            'new': `Create New Checking Project`,
            'select': 'Select Existing Bible Project to Check'
        };
        
        const { pickedKey } =  await this.doPrompting( 'Which Bible Project to Check?', choices)
        
        if (pickedKey === 'new') {
            return false
        } else {
            await delay(100)
            await this.openWorkspace()
            return true
        }
    }

    private static async doPrompting( title: string, choices: {}) {
        const keys = Object.keys(choices);
        // @ts-ignore
        const prompts = keys.map(key => choices[key])

        await delay(100)
        const pickedText = await vscode.window.showQuickPick(
          prompts,
          {
              placeHolder: title,
          },
        );

        // @ts-ignore
        const pickedKey = keys.find(key => pickedText === choices[key]) || ''
        return { pickedKey, pickedText }
        
    }

    private static async getGatewayLangSelection(preRelease = false) {
        let catalog = getSavedCatalog(preRelease);
        try {
            if (!catalog) {
                await showInformationMessage("Checking DCS for GLs - can take minutes");
                // @ts-ignore
                catalog = await this.getDoor43ResourcesCatalogWithProgress(resourcesPath, preRelease = false);
                // @ts-ignore
                saveCatalog(catalog, preRelease);
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
              placeHolder: "Select the gateway checking language:",
          },
        );
        // @ts-ignore
        gwLanguagePick = getLanguageCodeFromPrompts(gwLanguagePick) || "en";
        await showInformationMessage(`GL checking language selected ${gwLanguagePick}`);

        const owners = findOwnersForLang(catalog || [], gwLanguagePick);
        const gwOwnerPick = await vscode.window.showQuickPick(
          owners,
          {
              placeHolder: "Select the gateway checking organization:",
          },
        );
        await showInformationMessage(`GL checking owner selected ${gwOwnerPick}`);
        return {
            catalog,
            gwLanguagePick,
            gwOwnerPick
        };
    }

    private static async getBookSelection(targetBibleOptions:{}) {
        // @ts-ignore
        const { manifest } = await fetchBibleManifest('', targetBibleOptions.owner, targetBibleOptions.languageId, targetBibleOptions.bibleId, resourcesPath, 'none', 'master');
        // @ts-ignore
        const bookIds = manifest?.projects?.map((project: {}) => project.identifier)
        // const bookIds = Object.keys(ALL_BIBLE_BOOKS)
        let bookPick:string|undefined = ''
        if (bookIds?.length) {
            bookPick = await vscode.window.showQuickPick(
              bookIds,
              {
                  placeHolder: "Select the book to check:",
              },
            );

            await showInformationMessage(`Book selected ${bookPick}`);
        } else {
            await showErrorMessage(`Error getting book list for bible!`, true);
        }
        return {
            bookPick
        };
    }
}
