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
import { GeneralObject, ResourcesObject, TranslationCheckingPostMessages } from "../types";
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
    fileExists,
    fixUrls,
} from "./utilities/fileUtils";
import {
    DEFAULT_LOCALE,
    getCurrentLanguageCode,
    getGatewayLanguages,
    getLanguageCodeFromPrompts,
    getLanguagePrompts,
    LOCALE_KEY,
    setLocale,
} from "./utilities/languages";
// @ts-ignore
import isEqual from "deep-equal";
import { isNT } from "./utilities/BooksOfTheBible";
import {
    downloadRepoFromDCS,
    getOwnerReposFromRepoList,
    getOwnersFromRepoList,
    getRepoName,
    setStatusUpdatesCallback,
    uploadRepoToDCS,
} from "./utilities/network";
import { getCheckingRepos } from "./utilities/gitUtils";
import path from "path";
import { lookupTranslationForKey } from "./utilities/translations";

let _callbacks:object = { } // stores callback by key

function saveCallBack(key: string, callback: any) {
    // @ts-ignore
    _callbacks[key] = callback;
}

function getCallBack(key:string):any {
    // @ts-ignore
    const callback = _callbacks?.[key];
    return callback;
}

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
    public static translations: object | null = null

    constructor(private readonly context: ExtensionContext) {}

    /**
     * Registers various commands and providers necessary for the Checking Extension workflow.
     *
     * @param {ExtensionContext} context - The extension context provided by VSCode, which contains global and workspace-specific settings and subscriptions.
     * @return {Disposable[]} An array of Disposable objects representing the subscriptions and registrations created by the method.
     */
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
                      const results = await this.downloadResourcesWithProgress(glOptions.languageId, glOptions.owner || '', resourcesPath, preRelease, bookId)
                      
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

        commandRegistration = commands.registerCommand(
          "checking-extension.checkTNotes",
          executeWithRedirecting(async () => {
              console.log(`starting "checking-extension.checkTNotes"`)
              await this.openCheckingFile_(true)
          })
        );
        subscriptions.push(commandRegistration)

        commandRegistration = commands.registerCommand(
          "checking-extension.checkTWords",
          executeWithRedirecting(async () => {
              console.log(`starting "checking-extension.checkTWords"`)
              await this.openCheckingFile_(false)
          })
        );
        subscriptions.push(commandRegistration)

        return subscriptions;
    }

    /**
     * Initializes the workflow by resetting progress, configuring contexts, and loading initial states
     * for the extension based on the specified pre-release mode.
     *
     * @param {boolean} preRelease - Indicates whether to enable pre-release settings. Default is false.
     * @return {Promise<void>} A promise that resolves when the workflow initialization is complete.
     */
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

    /**
     * Displays user information in the provided webview panel.
     *
     * @param {WebviewPanel} webviewPanel - The webview panel where the user information will be shown.
     * @param {object} options - Configuration options for displaying the user information.
     * @return {Promise<void>} A promise that resolves when the user information is successfully displayed.
     */
    private static async  showUserInformation (webviewPanel: WebviewPanel, options: object) {
        this.promptUserForOption(webviewPanel, options)
    }

    /**
     * Prompts the user to select an option using the provided webview panel and options.
     *
     * @param {WebviewPanel} webviewPanel - The webview panel used to communicate messages to the user.
     * @param {object} options - The options to be presented to the user for selection.
     * @return {Promise<GeneralObject>} A promise that resolves with the selected option or data provided by the user.
     */
    private static async  promptUserForOption (webviewPanel: WebviewPanel, options: object) {
        const _promptUserForOption = (options: object): Promise<GeneralObject> => {
            const promise = new Promise<object>((resolve) => {
                saveCallBack("promptUserForOption", resolve);
                webviewPanel.webview.postMessage({
                    command: "promptUserForOption",
                    text: "prompt User For Option",
                    data: options
                });
            })
            return promise
        }
        const results = await _promptUserForOption(options)
        saveCallBack("promptUserForOption", null);
        return results
    }

    /**
     * Translates the given key into the corresponding localized string,
     * optionally including dynamic data and a default string if no translation is found.
     *
     * @param {string} key - The translation key used to look up the localized text.
     * @param {object|null} [data=null] - An object containing dynamic values to replace placeholders in the translation.
     * @param {string|null} [defaultStr=null] - A default string to return if the key is not found in the translations.
     * @return {string} The translated and formatted string, or the default string if the key is not found.
     */
    private static translate(key:string, data:object|null = null, defaultStr: string|null = null){
        const translation = lookupTranslationForKey(CheckingProvider.translations, key, data, defaultStr)
        return translation
    };

    /**
     * Displays an error message based on the provided key and optional data.
     *
     * @param {string} key - The key used to retrieve the error message.
     * @param {object|null} [data=null] - Optional data used for message translation.
     * @return {object} An object containing the error message and a success flag set to false.
     */
    private static showError(key:string, data: object|null = null){
        const message = this.translate(key, data)
        showErrorMessage(`${key} - ${message}`, true);
        return {
            errorMessage: message,
            success: false
        }
    };
    
    /**
     * Creates a new checking project by prompting the user for various options
     * such as target language, organization, Bible resource, book, GL language, and GL owner.
     * Downloads and initializes the necessary resources and repositories for the project.
     *
     * @param {WebviewPanel} webviewPanel - The webview panel instance where prompts and status messages will be displayed.
     * @return {Promise<{ success: boolean }>} A promise resolving to an object indicating the success status of the operation.
     */
    private static async createGlCheck(webviewPanel: WebviewPanel) {
        let success = false;
        let catalog = getSavedCatalog(false)
        const preRelease = this.getContext('preRelease');
        let loadCatalog = true
        
        if (catalog) {
            // prompt if we should load new catalog
            const data = await this.promptUserForOption(webviewPanel, { message: 'prompts.downloadCatalog', type: 'yes/No'})
            // @ts-ignore
            const reloadCatalog = !!data?.response
            loadCatalog = reloadCatalog
        }
        if (loadCatalog) {
            console.log("checking-extension.downloadCatalog")
            // show user we are loading new catalog
            this.showUserInformation(webviewPanel, { message: 'status.downloadingCatalog', busy: true})
            await delay(100)
            catalog = await getLatestResourcesCatalog(resourcesPath, preRelease)
            if (!catalog) {
                return this.showError('status.catalogDownloadError')
            }
            
            saveCatalog(catalog, preRelease)
        }

        //////////////////////////////////
        // Target language

        // @ts-ignore
        const targetLangChoices = getLanguagePrompts(getLanguagesInCatalog(catalog))

        // prompt for GL language selection
        let data = await this.promptUserForOption(webviewPanel, { message: 'prompts.selectTargetLanguage', type: 'option', choices: targetLangChoices})
        // @ts-ignore
        let targetLanguagePick = data?.responseStr
        
        // @ts-ignore
        targetLanguagePick = getLanguageCodeFromPrompts(targetLanguagePick) || 'en'

        if (!targetLanguagePick) {
            return this.showError('status.noLanguage')
        }

        let message = this.translate('status.languageSelected', { targetLanguagePick })
        await showInformationMessage(message);

        const targetOwners = findOwnersForLang(catalog || [], targetLanguagePick)
        
        data = await this.promptUserForOption(webviewPanel, { message: 'prompts.selectOrganization', type: 'option', choices: targetOwners })
        // @ts-ignore
        let targetOwnerPick = data?.responseStr

        if (!targetOwnerPick) {
            return this.showError('status.noOwner')
        }

        message = this.translate('status.ownerSelected', { targetOwnerPick })
        await showInformationMessage(message);
        
        const resources = findResourcesForLangAndOwner(catalog || [], targetLanguagePick, targetOwnerPick || '')
        const bibles = findBibleResources(resources || [])
        const bibleIds = getResourceIdsInCatalog(bibles || [])

        data = await this.promptUserForOption(webviewPanel, { message: 'prompts.selectTargetBible', type: 'option', choices: bibleIds })
        // @ts-ignore
        let targetBibleIdPick = data?.responseStr

        if (!targetBibleIdPick) {
            return this.showError('status.noBible')
        }

        message = this.translate('status.bibleSelected', { targetBibleIdPick })
        await showInformationMessage(message);

        const targetBibleOptions = {
            languageId: targetLanguagePick,
            owner: targetOwnerPick,
            bibleId: targetBibleIdPick
        }

        // @ts-ignore
        const { manifest } = await fetchBibleManifest('', targetBibleOptions.owner, targetBibleOptions.languageId, targetBibleOptions.bibleId, resourcesPath, 'none', 'master');
        // @ts-ignore
        const bookIds = manifest?.projects?.map((project: {}) => project.identifier)

        data = await this.promptUserForOption(webviewPanel, { message: 'prompts.selectTargetBook', type: 'option', choices: bookIds })
        
        const bookId = data?.responseStr
        if (!bookId) {
            return this.showError('status.noBook')
        }

        message = this.translate('status.bookSelected', { targetBookPick: bookId })
        await showInformationMessage(message);

        //////////////////////////////////
        // select GL language

        const gatewayLanguages = getGatewayLanguages();
        const glChoices = getLanguagePrompts(gatewayLanguages);

        data = await this.promptUserForOption(webviewPanel, { message: 'prompts.selectGatewayLanguage', type: 'option', choices: glChoices })
        let gwLanguagePick = data?.responseStr

        // @ts-ignore
        gwLanguagePick = getLanguageCodeFromPrompts(gwLanguagePick) || "en";
        if (!gwLanguagePick) {
            return this.showError('status.noCheckingLanguage')
        }

        message = this.translate('status.glSelected', {  gwLanguagePick })
        await showInformationMessage(message);

        const ignoreOwners:string[] = ['Door43-Catalog'];
        const owners = findOwnersForLang(catalog || [], gwLanguagePick, ignoreOwners);
        if (!owners?.length) {
            return this.showError('status.noGlOwner')
        }

        data = await this.promptUserForOption(webviewPanel, { message: 'prompts.selectGatewayOwner', type: 'option', choices: owners })
        const gwOwnerPick = data?.responseStr
        if (!gwOwnerPick) {
            return this.showError('status.noGlOwner')
        }

        message = this.translate('status.glOwnerSelected', {  gwOwnerPick })
        await showInformationMessage(message);

        this.showUserInformation(webviewPanel, { message: 'status.creatingProject', busy: true})

        const glOptions = {
            languageId: gwLanguagePick,
            owner: gwOwnerPick
        }

        const results = await this.downloadResourcesWithProgress(glOptions.languageId, glOptions.owner || '', resourcesPath, preRelease, bookId)

        // @ts-ignore
        if (results.error) {
            return this.showError('status.glResourceDownloadError')
        }

        const targetLanguageId = targetBibleOptions.languageId;
        const targetBibleId = targetBibleOptions.bibleId || "";
        const targetOwner = targetBibleOptions.owner;
        const targetBibleDescr = `${targetOwner}/${targetLanguageId}/${targetBibleId}`
        message = this.translate('status.downloadingTargetBible', {  targetBible: targetBibleDescr })
        await showInformationMessage(message);
        // @ts-ignore
        const targetFoundPath = await downloadTargetBible(targetBibleId, resourcesPath, targetLanguageId, targetOwner, catalog, bookId, 'master');
        if (!targetFoundPath) {
            return this.showError('status.targetBibleDownloadError')
        }

        const { repoInitSuccess, repoPath} = await this.doRepoInitAll(targetLanguageId, targetBibleId, glOptions.languageId, targetOwner, glOptions.owner, catalog, bookId, preRelease);
        
        if (!repoInitSuccess) {
            return this.showError('status.errorCreatingProject')
        }

        // navigate to new folder
        const repoPathUri = vscode.Uri.file(repoPath);
        message = this.translate('status.successCreatingProject', {  repoPath })
        await showInformationMessage(message, true, this.translate('status.checkingInstructions'));
        vscode.commands.executeCommand("vscode.openFolder", repoPathUri);

        return { success: true }
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

    /**
     * Navigates to a specific workflow step within the extension walkthrough.
     *
     * @param {string} step - The identifier for the specific workflow step to navigate to.
     * @return {Promise<void>} Resolves when the workflow step navigation process is complete.
     */
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

    /**
     * Opens a workspace folder using the Visual Studio Code open folder dialog.
     *
     * This method prompts the user to select a folder, opens the selected folder
     * in the workspace, and returns the workspace folder object if successful.
     *
     * @return {vscode.WorkspaceFolder | undefined} The opened workspace folder, or undefined if no folder was selected or operation failed.
     */
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

    /**
     * Initializes the project by validating and setting up the repository as necessary.
     *
     * @param {boolean} [navigateToFolder=false] - Determines whether navigation to a folder is required during initialization.
     * @return {Promise<void>} Resolves when the Checker initialization process completes or rejects in case of an error.
     */
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

    /**
     * Initializes the Bible folder for a given project by setting up necessary configurations
     * and repositories based on the provided input parameters.
     *
     * @param {object} results - The object containing necessary data from the project's manifest and optional gateway language options.
     * @param {string} projectPath - The path to the project where the Bible folder will be initialized.
     * @param {boolean} [preRelease=false] - A flag indicating whether to use pre-release resources during initialization.
     *
     * @return {Promise<boolean|null>} A promise that resolves to `true` if repository initialization succeeds,
     * `null` if an error occurs during gateway language selection, or `false` if repository initialization fails.
     */
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

    /**
     * Initializes an empty folder and sets up repository configurations based on specified options.
     * This includes fetching necessary options, initializing a repository, and navigating
     * to the folder if successful. If initialization fails, appropriate error messages are displayed.
     *
     * @param {boolean} [preRelease=false] - Determines whether to initialize in pre-release mode.
     * @return {Promise<void>} A promise that resolves when the folder initialization is complete or an error is handled.
     */
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

    /**
     * Initializes a repository based on the provided parameters. If the repository does not already exist,
     * this method attempts to create it. If the repository already exists, an error message is displayed.
     *
     * @param {string} targetLanguageId - The ID of the target language for the repository.
     * @param {string | undefined} targetBibleId - The ID of the target Bible, or undefined if not provided.
     * @param {string} glLanguageId - The ID of the gateway language.
     * @param {string | undefined} targetOwner - The owner of the target repository, or undefined if not provided.
     * @param {string | undefined} glOwner - The owner of the gateway language repository, or undefined if not provided.
     * @param {object[] | null} catalog - The catalog data related to the repository, or null if not provided.
     * @param {string | null} bookId - The ID of the book, or null if not provided.
     * @param {boolean} [preRelease=false] - Indicates whether to initialize the repository in pre-release mode. Defaults to false.
     *
     * @return {Promise<{repoInitSuccess: boolean, repoPath: string}>} - An object containing a boolean indicating
     * whether the repository initialization was successful and the path of the repository.
     */
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

    /**
     * Initializes the repository for a given project, checking necessary resources,
     * and handling errors or missing resources appropriately.
     *
     * @param {string} repoPath - Path to the repository to initialize.
     * @param {string} targetLanguageId - ID of the target language.
     * @param {string | undefined} targetBibleId - ID of the target Bible, or undefined if not applicable.
     * @param {string} glLanguageId - ID of the gateway language.
     * @param {string | undefined} targetOwner - Owner of the target repository, or undefined if not applicable.
     * @param {string | undefined} glOwner - Owner of the gateway language resources, or undefined if not applicable.
     * @param {object[] | null} catalog - Catalog of resources or null if no catalog is available.
     * @param {string | null} bookId - ID of the book to initialize, or null if not specific to a book.
     * @param {boolean} [preRelease=false] - Optional flag indicating if pre-release resources should be used.
     * @return {Promise<boolean>} A promise that resolves to true if the repository initialization was successful, false otherwise.
     */
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

    /**
     * Downloads GL resources with a progress notification in the VSCode UI.
     *
     * This method downloads the latest language Helpson resources asynchronously while providing real-time progress updates
     * using VSCode's progress notification system.
     *
     * @param {string} languageId - The language identifier for the resources to be downloaded.
     * @param {string} owner - The owner of the resources repository (e.g., organization or username in source control).
     * @param {string} resourcesPath - The local file path where the resources will be downloaded.
     * @param {boolean} [preRelease=false] - Optional. Specifies whether to use pre-release resources. Defaults to false.
     * @param {string} [bookId=''] - Optional. The identifier for a specific book to narrow down resources. Defaults to an empty string.
     * @return {Promise<object>} A promise that resolves to an object representing the downloaded resource details.
     */
    private static async downloadResourcesWithProgress(languageId:string, owner:string, resourcesPath:string, preRelease = false, bookId = ''):Promise<object> {
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

    /**
     * Initializes a project with progress tracking and resource downloading indication.
     *
     * @param {string} repoPath - The path to the repository where the project will be initialized.
     * @param {string} targetLanguageId - The identifier for the target language.
     * @param {string | undefined} targetOwner - The owner or organization of the target project.
     * @param {string | undefined} targetBibleId - The identifier for the target Bible if applicable.
     * @param {string} glLanguageId - The identifier for the Gateway Language (GL).
     * @param {string | undefined} glOwner - The owner or organization of the Gateway Language project.
     * @param {object[] | null} catalog - The catalog of resources to be used in the project initialization.
     * @param {string | null} bookId - The identifier of the book to be initialized in the project.
     * @param {boolean} [preRelease=false] - A flag indicating if pre-release resources should be used.
     * @return {Promise<object>} A promise that resolves with the initialization results as an object.
     */
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
                    message = message || ''
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
     * Loads and renders a custom text editor for the checking document.
     * This method initializes the webview with appropriate settings, handles localization setup, and manages various
     * actions such as saving data, updating the webview, and handling specific commands invoked by the webview.
     *
     * @param {TextDocument} document - The document that this custom editor is being used with.
     * @param {WebviewPanel} webviewPanel - The webview panel created for the custom text editor.
     * @param {CancellationToken} _token - A token that signals if the editor resolving should be canceled.
     * @return {Promise<void>} - A promise that resolves when the custom editor is successfully initialized and ready.
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
                    // @ts-ignore
                    foundCheck.invalidated = currentCheck?.invalidated
                    
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

        const createNewOlCheck = (text:string, data:object) => {
            delay(100).then(async () => {
                console.log(`createNewOlCheck: ${text} - ${data}`)
                const results = await CheckingProvider.createGlCheck(webviewPanel)

                // send back value
                webviewPanel.webview.postMessage({
                    command: "createNewOlCheckResponse",
                    data: results,
                } as TranslationCheckingPostMessages);
            })
        }

        /**
         * Message handler that Uploads changes to checking project data to a DCS server.
         * This function performs the following tasks:
         *  - Retrieves metadata and repository information for the project.
         *  - Saves all current changes in the workspace to the filesystem.
         *  - Creates and uploads the project repository to DCS.
         *  - Sends status updates and the final response back to the webview panel.
         *
         * @param {string} text - Message to be logged.
         * @param {object} data - An object containing configuration data required for the upload process.
         * @param {string} data.token - Authentication token for DCS.
         * @param {string} data.owner - The owner of the repository on DCS.
         * @param {string} data.server - The server URL of DCS.
         *
         * @returns {void} - Sends progress status and final results via a webview panel.
         */
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
                await vscode.workspace.saveAll(); // write document changes to file system
                const { projectPath, repoFolderExists } = await getWorkSpaceFolder();
                const metaData = getMetaData(projectPath || '')
                const { targetLanguageId, targetBibleId, gatewayLanguageId, bookId } = metaData?.["translation.checker"]
                const repo = getRepoName(targetLanguageId, targetBibleId, gatewayLanguageId, bookId);
                const statusUpdates = (message: string) => {
                    webviewPanel.webview.postMessage({
                        command: "uploadToDcsStatusResponse",
                        data: message,
                    } as TranslationCheckingPostMessages);
                }
                setStatusUpdatesCallback(statusUpdates)
                const results = await uploadRepoToDCS(server, owner, repo, token, projectPath || '')
                setStatusUpdatesCallback(null)

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
        
        const openCheckingFile = async (text: string, data: object) => {
            // @ts-ignore
            const openTNotes = data?.openTNotes;
            console.log(`openCheckingFile: ${text} - ${openTNotes}`)
            await CheckingProvider.openCheckingFile_(openTNotes)
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
        
        const saveAppSettings = (text:string, data:object) => {
            // @ts-ignore
            const newSettings = data?.settings
            delay(100).then(async () => {
                const { projectPath, repoFolderExists } = await getWorkSpaceFolder();
                if (repoFolderExists && projectPath) {
                    const metaData = getMetaData(projectPath || '')
                    const _metaData = metaData?.["translation.checker"]
                    _metaData.settings = newSettings
                    const outputPath = path.join(projectPath, 'metadata.json')
                    fs.outputJsonSync(outputPath, metaData, { spaces: 2 })
                } else {
                    console.warn (`saveAppSettings() projectPath '${projectPath}' does not exist`)
                }
            })
        }

        const promptUserForOptionResponse = (text:string, data:object) => {
            console.log(`promptUserForOptionResponse: ${text}`)
            const key = "promptUserForOption";
            const callback = getCallBack(key)
            if (callback) {
                // @ts-ignore
                callback(data);
                saveCallBack(key, null) // clear callback after use
            } else {
                console.error(`No handler for promptUserForOptionResponse(${key}) response`)
            }
        }

        /**
         * Handles message events by processing the message properties and executing the corresponding command function.
         *
         * This function extracts the `command`, `text`, and `data` properties from the incoming message and maps the command
         * to a specific handler function defined in the `commandToFunctionMapping` object. If a handler function exists for the
         * command, it is executed with the given `text` and `data` parameters. If no handler is found, an error message is logged.
         *
         * @param {object} message - The message object containing command information.
         * @param {string} message.command - The command to be executed.
         * @param {string} message.text - The text passed along with the command.
         * @param {any} message.data - Additional data required for processing the command.
         */
        const messageEventHandlers = (message: any) => {
            const { command, text, data } = message;
            // console.log(`messageEventHandlers ${command}: ${text}`)

            const commandToFunctionMapping: CommandToFunctionMap = {
                ["changeTargetVerse"]: changeTargetVerse_,
                ["createNewOlCheck"]: createNewOlCheck,
                ["getSecret"]: getSecret,
                ["loaded"]: firstLoad,
                ["openCheckingFile"]: openCheckingFile,
                ["promptUserForOptionResponse"]: promptUserForOptionResponse,
                ["saveAppSettings"]: saveAppSettings,
                ["saveCheckingData"]: saveCheckingData,
                ["saveSecret"]: saveSecret,
                ["setLocale"]: setLocale_,
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
     * Fixes CSS file by updating URLs to point to correct runtime paths.
     *
     * @param {vscode.Uri} assetsPath - The URI of the assets folder where the CSS file is located.
     * @return {void} This method does not return a value.
     */
    private fixCSS(assetsPath: vscode.Uri) {
        console.log(`fixCSS - assetsPath`, assetsPath.fsPath);
        const runTimeFolder = vscode.Uri.joinPath(assetsPath, '..')
        const cssPath = vscode.Uri.joinPath(assetsPath, "index.css");
        console.log(`fixCSS - cssPath.path`, cssPath.path);
        console.log(`fixCSS - cssPath.fsPath`, cssPath.fsPath);
        try {
            const data = fs.readFileSync(cssPath.fsPath, "UTF-8")?.toString() || '';
            console.log(`data.length`, data?.length);
            const { changes, parts, newCss } = fixUrls(data, runTimeFolder.fsPath);

            if (changes) {
                fs.outputFileSync(cssPath.fsPath, newCss, 'UTF-8');
            }
        } catch (e) {
            console.error(`fixCSS - cannot fix index.css at ${cssPath}`, e)
        }
    }
    
    /**
     * Finds a specific check object within the provided checkingData structure that matches the criteria in currentContextId.
     *
     * @param {object} currentContextId - The context identifying the check to be found. Contains attributes like checkId, groupId, quote, occurrence, and reference.
     * @param {object} checkingData - The data structure where the checks are stored, organized by category and groups.
     * @return {null|object} - Returns the found check object if it matches the provided criteria; otherwise, returns null.
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
     * Retrieves and parses the checking document and loads the related checking resources.
     *
     * @param {TextDocument} document - The text document containing the checks.
     * @return {ResourcesObject} The resources object parsed from the document, including associated checks and translations.
     *                            If the document is empty or invalid, an empty object is returned. An error is thrown if the content cannot be parsed.
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
            CheckingProvider.translations = resources?.locales
            return resources;
        } catch {
            throw new Error(
                "getCheckingResources - Could not get document as json. Content is not valid check file in json format",
            );
        }
        return { }
    }

    /**
     * Updates the provided document with the specified checking data.
     * Replaces the entire content of the document with a new JSON representation
     * of the checking data.
     *
     * @param {TextDocument} document - The document to update. Represents the file being edited.
     * @param {object} checkingData - The data used to update the document. Converted into JSON format.
     * @return {Thenable<boolean>} A promise that resolves to a boolean indicating whether the edit was successful.
     */
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

    /**
     * Retrieves and returns checking options by fetching gateway language selection
     * and target language selection details.
     *
     * @return {Promise<{
     *     catalog: object,
     *     gwLanguagePick: object,
     *     gwOwnerPick: object,
     *     targetLanguagePick: object,
     *     targetOwnerPick: object,
     *     targetBibleIdPick: object
     * } | null>} A promise that resolves to an object containing the checking options
     * or null if no options are available.
     */
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

    /**
     * Retrieves the target language selection along with associated target owner and Bible ID
     * through a series of user prompts.
     *
     * @param {object[] | null} catalog - The catalog of available languages, owners, and resources.
     * @return {Promise<object>} A promise that resolves to an object containing the following:
     *                            - targetLanguagePick: The id of the selected target language.
     *                            - targetOwnerPick: The selected target organization/owner.
     *                            - targetBibleIdPick: The ID of the selected Bible resource.
     */
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

    /**
     * Prompts user for information to determine DCS (Digital Content Service) repo and then downloads it.
     * 
     * The method fetches available owners and repositories from the server,
     * prompts the user to select an owner and a repository, and then proceeds to download the selected repository.
     * Handles potential conflicts by offering options to backup existing projects before downloading.
     *
     * @return {Promise<string>} A promise that resolves to the local path of the downloaded project if successful, or an empty string if the download fails or is canceled.
     */
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

    /**
     * Fetches the Door43 resources catalog from the specified resources path with progress notification.
     *
     * @param {string} resourcesPath - The file path or URL to the Door43 resources.
     * @param {boolean} [preRelease=false] - An optional flag indicating whether to fetch pre-release resources.
     * @return {Promise<Object>} A promise that resolves to the catalog object retrieved from the resources path.
     */
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

    /**
     * Checks the current workspace for validity and initialization status of a Bible repository.
     *
     * This method performs checks to determine if the workspace contains a valid Bible repository,
     * whether the repository folder exists, if it's initialized properly, and whether metadata and checks
     * are properly set up. It returns an object encapsulating the results of these checks.
     *
     * @return {Promise<{repoExists: boolean, isValidBible: boolean, isCheckingInitialized: boolean, repoFolderExists: boolean, projectPath: string | undefined}>}
     * An object containing:
     * - `repoExists`: A boolean indicating if a repository exists.
     * - `isValidBible`: A boolean indicating if the repository is a valid Bible project.
     * - `isCheckingInitialized`: A boolean indicating if checks and metadata have been properly initialized.
     * - `repoFolderExists`: A boolean indicating if the required workspace folder exists.
     * - `projectPath`: The path to the workspace or repository, if available.
     */
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

    /**
     * Prompts the user to update a specific folder by providing options to create a new checking project
     * or select an existing Bible project to check.
     *
     * @return {Promise<boolean>} A promise that resolves to `false` if the user chooses to create a new
     * checking project, or `true` if an existing project is selected and the workspace is opened.
     */
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

    /**
     * Asynchronously presents a prompt to the user with a list of choices and accepts their selection.
     *
     * @param {string} title - The placeholder title displayed in the selection prompt.
     * @param {{}} choices - An object containing keys and their corresponding selectable prompt values.
     * @return {Promise<{ pickedKey: string, pickedText: string }>} A promise resolving to an object containing the key and text of the selected choice.
     */
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

    /**
     * Retrieves Gateway Language (GL) selections, allowing users to select a language and its organization
     * either from a cached catalog or by fetching from the server if the catalog is not available.
     *
     * @param {boolean} [preRelease=false] - Specifies whether to fetch from the pre-release resources.
     * @return {Promise<{catalog: Array, gwLanguagePick: string, gwOwnerPick: string}>} -
     *     Returns an object containing the catalog, selected gateway language, and gateway owner.
     */
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

    /**
     * Retrieves the selected book from the list of available Bible books.
     *
     * @param {Object} targetBibleOptions - The target options for fetching the Bible manifest, which includes the owner, languageId, and bibleId.
     * @return {Promise<Object>} A promise that resolves with an object containing the selected book identifier (`bookPick`) or undefined if no book is selected.
     */
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

    /**
     * Retrieves the checking filename based on the specified project path and translation notes option.
     *
     * @param {string} projectPath - The path to the project directory.
     * @param {boolean} openTNotes - A flag indicating whether to use translation notes (true) or translation word list (false).
     * @return {Promise<any>} A promise that resolves to the absolute path of the checking file if metadata is available, or null if not.
     */
    protected static async getCheckingFilename(projectPath: string, openTNotes: boolean): Promise<any> {
        try {
            const metaData = getMetaData(projectPath)

            if (metaData) {
                const checkerData = metaData?.['translation.checker'];
                if (checkerData) {
                    console.log(`selectExistingProject() metaData: `, metaData)
                    const extension = openTNotes ? `tn_check` : `twl_check`
                    const checksPath = openTNotes ? checkerData?.tn_checksPath : checkerData?.twl_checksPath;
                    const relativeCheckPath = path.join(checksPath, `${checkerData?.bookId}.${extension}`);
                    const absoluteCheckPath = path.join(projectPath, relativeCheckPath);
                    return absoluteCheckPath;
                }
            } else {
                console.log('No metadata.json found.');
            }
        } catch (e) {
            console.log(`Not a project folder: ${projectPath}`);
        }
        return null;
    }

    /**
     * Opens a checking file (either tWords or tNotes) in the project's workspace folder.
     * The method retrieves the workspace folder, checks for the existence of a repository folder,
     * and constructs the absolute path to the checking file. If the file path is valid, it opens the file.
     *
     * @param {boolean} openTNotes - Specifies whether to include additional file-opening behavior for TNotes.
     * @return {Promise<any>} A promise that resolves when the file opening operation completes, or rejects if an error occurs.
     */
    public static async openCheckingFile_(openTNotes: boolean): Promise<any> {
        const { projectPath, repoFolderExists } = await getWorkSpaceFolder();
        if (repoFolderExists && projectPath) {
            const absoluteCheckPath = await this.getCheckingFilename(projectPath, openTNotes);
            if (absoluteCheckPath) {
                // Open the file with the custom editor instead of as a text file
                await vscode.commands.executeCommand(
                  'vscode.openWith',
                  vscode.Uri.file(absoluteCheckPath),
                  CheckingProvider.viewType
                );
            } else {
                showErrorMessage(`Error Invalid repo ${projectPath}`, true);
            }
        } else {
            if (projectPath) {
                showErrorMessage(`Error Invalid repo ${projectPath}`, true);
            } else {
                showErrorMessage(`Error No project selected`, true);
            }
        }
    }
}
