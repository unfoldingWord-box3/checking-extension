// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect, useContext } from "react";
import { vscode } from "../utilities/vscode";
import "../css/styles.css";

// @ts-ignore
import AuthContextProvider from '../dcs/context/AuthContext'

import type { TnTSV } from "../../../types/TsvTypes"
import { GeneralObject, ResourcesObject } from "../../../types";
import { makeStyles } from "@material-ui/core";
// @ts-ignore
import { APP_NAME, APP_VERSION } from "../common/constants.js";
// @ts-ignore
import TranslationCheckingPane from "./TranslationCheckingPane";
// @ts-ignore
import isEqual from 'deep-equal'
import { AlignmentMapType } from "../shared/translationUtils";

type CommandToFunctionMap = Record<string, (data: any) => void>;

type TranslationNotesViewProps = {
    chapter: number;
    verse: number;
};

// @ts-ignore
const useStyles = makeStyles(theme => ({
    root: {
        display: 'flex',
        flexGrow: 1,
        flexDirection: 'row',
        backgroundColor: '#19579E',
        color: '#FFFFFF',
        padding: '10px',
        margin: '0px',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    button: {
        minWidth: '40px',
        padding: '5px 0px',
        marginRight: theme.spacing(3),
    },
    icon: { width: '40px' },
    menuButton: { marginRight: theme.spacing(1) },
    title: {
        flexGrow: 1,
        cursor: 'pointer',
        backgroundColor: '#19579E',
        marginBottom: '10px',
        fontSize: '16px',
        fontWeight: 'bold'
    },
}))

let _callbacks:object = { } // saves callback by key
let uploadProgress: string[] = []

function clearUploadProgress() {
    uploadProgress = []
}

function addToUploadProgress(status: string) {
    uploadProgress.push(status)
}

function saveCallBack(key: string, callback: any) {
    // @ts-ignore
    _callbacks[key] = callback;
}

function getCallBack(key:string):any {
    // @ts-ignore
    const callback = _callbacks?.[key];
    return callback;
}

type StateType = {
    checkingObj: ResourcesObject;
    initialContextId: object;
    previousTranslations: AlignmentMapType;
};

console.log("TranslationCheckingView.tsx")

function TranslationCheckingView() {
    const [state, _setState] = useState<StateType>({
        checkingObj: {},
        initialContextId: {},
        previousTranslations: {},
    })
    const {
        checkingObj,
        initialContextId,
        previousTranslations,
    } = state

    function setState(newState:object) {
        _setState(prevState => ({ ...prevState, ...newState }))
    }

    /**
     * generate an unique key for this project
     * @param checkingObj
     */
    function getProjectKey(checkingObj:object):string {
        // @ts-ignore
        const project = checkingObj?.project || {};
        // @ts-ignore
        const bookId = project?.bookId
        // @ts-ignore
        const resourceId = project?.resourceId
        // @ts-ignore
        const metadata = checkingObj?.metadata || {}
        // @ts-ignore
        const languageId = metadata?.targetLanguageId || 'en'
        // @ts-ignore
        const targetBibleId = metadata?.targetBibleId || 'en'
        // @ts-ignore
        const targetOwner = metadata?.targetOwner || 'en'
        // @ts-ignore
        const gatewayLanguageId = metadata?.gatewayLanguageId || ''
        // @ts-ignore
        const gatewayLanguageOwner = metadata?.gatewayLanguageOwner || ''
        const key = `${languageId}_${targetBibleId}_${targetOwner}_${resourceId}_${gatewayLanguageId}_${gatewayLanguageOwner}_${bookId}`
        return key
    }

    const projectKey = getProjectKey(checkingObj)

    function getContextIdKey(projectKey:string) {
        return `${projectKey}.contextId`;
    }

    /**
     * Initializes checking data.
     *
     * @param {TnTSV} data - The data object used to determine the project key and context id.
     * @return {Promise<void>} A promise that resolves when the data initialization completes.
     */
    async function initData(data: TnTSV) {
        const key = getContextIdKey(getProjectKey(data))
        secretProvider.getItem(key).then(value => {
            // @ts-ignore
            const contextId = value || {};
            setState({
                checkingObj: data,
                initialContextId: contextId,
            })
        })
    }

    async function loadPreviousTranslations_(previousTranslations: AlignmentMapType) {
        if (previousTranslations && Object.keys(previousTranslations).length) {
            setState({
                previousTranslations,
            })
        }
    }


    /**
     * Handles incoming message events and executes specific functions based on the command within the event's data.
     *
     * The `handleMessage` function listens for `MessageEvent` objects and processes them by extracting the `command`
     * and `data` properties. Based on the command, it invokes the corresponding handler function from a predefined
     * command-to-function mapping. If no matching command is found, an error message is logged.
     *
     * Functionality:
     * - Processes specific commands contained in `MessageEvent` data.
     * - Supports handling commands like `update`, `getSecretResponse`, `uploadToDCSResponse`, `uploadToDcsStatusResponse`,
     *   `promptUserForOption`, and `createNewOlCheckResponse`.
     * - Logs an error if no handler is available for a specific command.
     *
     * Command-to-function mapping:
     * - "update": Calls a function to initialize specific data.
     * - "getSecretResponse": Handles responses for secret retrieval using a callback mechanism.
     * - "uploadToDCSResponse": Completes the upload process to DCS and clears callback.
     * - "uploadToDcsStatusResponse": Manages upload status updates and updates upload progress.
     * - "promptUserForOption": Triggers a callback to prompt the user for options.
     * - "createNewOlCheckResponse": Executes a callback related to creating a new OL check.
     *
     * Error Handling:
     * - Logs an error when a callback or handler for a specific command is not found or missing.
     * - Logs an error when an unrecognized command is received.
     *
     * @param {MessageEvent} event - The message event received, containing the `command` and associated `data`.
     */
    const handleMessage = (event: MessageEvent) => {
        const { command, data } = event.data;
        console.log(`handleMessage`, command)

        const update = (data: TnTSV) => {
            initData(data);
        };

        const loadPreviousTranslations = (data: AlignmentMapType) => {
            loadPreviousTranslations_(data);
        };

        const getSecretResponse = (value: string|undefined) => {
            // @ts-ignore
            const key = value?.key
            const callback = getCallBack(key);
            if (callback) {
                // @ts-ignore
                callback(value);
                saveCallBack(key, null) // clear callback after use
            } else {
                console.error(`getSecretResponse - No handler for ${key} response`)
            }
        };

        const uploadToDCSResponse = (value: string | undefined) => {
            // @ts-ignore
            const key = "uploadToDCS";
            const callback = getCallBack(key);
            if (callback) {
                // @ts-ignore
                callback(value);
                saveCallBack(key, null) // clear callback after use
            } else {
                console.error(`uploadToDCSResponse - No handler for ${key} response`)
            }
            saveCallBack("DCSuploadStatus", null);
        };

        const uploadToDcsStatusResponse = (value: string | undefined) => {
            // @ts-ignore
            const key = "uploadToDcsStatusResponse";
            const callback = getCallBack(key);
            value = value || ''
            addToUploadProgress(value)
            if (callback) {
                const update = {
                    status: value,
                    log: uploadProgress,
                }
                // @ts-ignore
                callback(update);
            } else {
                console.error(`uploadToDcsStatusResponse - No handler for ${key} response`)
            }
        };

        const promptUserForOption = (value: object|undefined) => {
            // @ts-ignore
            const key = 'createNewOlCheckCallback'
            const callback = getCallBack(key);
            if (callback) {
                // @ts-ignore
                callback(value);
            } else {
                console.error(`promptUserForOption - No handler for ${key} response`)
            }
        };

        const createNewOlCheckResponse = (value: object|undefined) => {
            // @ts-ignore
            const key = 'createNewOlCheck'
            const callback = getCallBack(key);
            if (callback) {
                // @ts-ignore
                callback(value);
            } else {
                console.error(`createNewOlCheckResponse - No handler for ${key} response`)
            }
        };


        const commandToFunctionMapping: CommandToFunctionMap = {
            ["update"]: update,
            ["getSecretResponse"]: getSecretResponse,
            ["promptUserForOption"]: promptUserForOption,
            ["uploadToDCSResponse"]: uploadToDCSResponse,
            ["uploadToDcsStatusResponse"]: uploadToDcsStatusResponse,
            ["createNewOlCheckResponse"]: createNewOlCheckResponse,
            ["previousTranslations"]: loadPreviousTranslations,
        };

        const mappedCommand = commandToFunctionMapping[command];
        if (mappedCommand) {
            mappedCommand(data);
        } else {
            console.error(`handleMessage() - Command missing for (${command}) response`)
        }
    };

    const secretProvider = {
        getItem: async (key:string) => {
            let data = await getSecret(key)
            // @ts-ignore
            const value = data?.valueObject || data?.value;
            return value
        },
        setItem: async (key:string, value:any) => {
            await setSecret(key, value)
        },
        removeItem: async (key:string) => {
            await setSecret(key, '')
        }
    }

    async function setSecret(key:string, value:any) {
        const promise = new Promise<string>((resolve) => {
             vscode.postMessage({
                command: "saveSecret",
                text: "Save Secret",
                data: { key, value },
            });
            resolve(value)
        })
        return promise
    }

    async function getSecret(key:string):Promise<string> {
        const promise = new Promise<string>((resolve) => {
            saveCallBack(key, resolve);
            vscode.postMessage({
                command: "getSecret",
                text: "Get Secret",
                data: { key }
            });
        })
        return promise
    }

    async function uploadToDCS(server:string, owner: string, token: string, dcsUpdateCallback: (update: object) => void): Promise<GeneralObject> {
        const _uploadToDCS = (server:string, owner: string, token: string): Promise<GeneralObject> => {
            const promise = new Promise<object>((resolve) => {
                saveCallBack("uploadToDCS", resolve);
                saveCallBack("uploadToDcsStatusResponse", dcsUpdateCallback);
                clearUploadProgress()
                vscode.postMessage({
                    command: "uploadToDCS",
                    text: "Upload Repo to DCS",
                    data: { server, owner, token }
                });
            })
            return promise
        }
        const results = await _uploadToDCS(server, owner, token)
        return results
    }

    async function createNewOlCheck(data: object, createNewOlCheckCallback: (data: object) => void): Promise<GeneralObject> {
        const _createNewOlCheck = (data: object): Promise<GeneralObject> => {
            const promise = new Promise<object>((resolve) => {
                saveCallBack("createNewOlCheck", resolve);
                saveCallBack("createNewOlCheckCallback", createNewOlCheckCallback);
                vscode.postMessage({
                    command: "createNewOlCheck",
                    text: "createNewOlCheck",
                    data
                });
            })
            return promise
        }
        const results = await _createNewOlCheck(data)
        return results
    }

    async function promptUserForOptionCallback(data: object){
        vscode.postMessage({
            command: "promptUserForOptionResponse",
            text: "promptUserForOptionResponse",
            data
        });
    }

    async function openCheckingFile(openTNotes: boolean){
        vscode.postMessage({
            command: "openCheckingFile",
            text: "openCheckingFile",
            data: {
                openTNotes
            }
        });
    }
    
    function sendFirstLoadMessage() {
        vscode.postMessage({
            command: "loaded",
            text: "Webview first load success",
        });
    }
    
    useEffect(() => {
        window.addEventListener("message", handleMessage);
        sendFirstLoadMessage();

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    /**
     * send message back to extension to save new selection to file
     *
     * @param {Object} newState - The new state object containing updated checking data
     *
     * @return {void} This method does not return any value.
     */
    function saveCheckingData(newState:{}) {
        // @ts-ignore
        const currentCheck = newState?.currentCheck;
        const currentContextId = currentCheck?.contextId
        // @ts-ignore
        const checks = checkingObj?.checks;
        // @ts-ignore
        const { check, catagoryId, groupId, index } = findCheckToUpdate(currentContextId, checks)
        if (check && catagoryId && groupId) { // TRICKY: do shallow copy of section of checkingObj and modify matched check
            const newCheckingObj = {...checkingObj}
            // @ts-ignore
            const newChecks = {...newCheckingObj?.checks}
            // @ts-ignore
            newCheckingObj.checks = newChecks
            // @ts-ignore
            const newCatagory = { ...newChecks[catagoryId] }
            // @ts-ignore
            newChecks[catagoryId] = newCatagory
            // @ts-ignore
            const newGroups = { ...newCatagory.groups }
            // @ts-ignore
            newCatagory.groups = newGroups
            // @ts-ignore
            const newGroup = [ ...newGroups[groupId] ]
            // @ts-ignore
            newGroups[groupId] = newGroup
            const newItem = {
                // @ts-ignore
                ...newGroup[index],
                ...currentCheck,
            }
            // @ts-ignore
            newGroup[index] = newItem
            if (Object.hasOwn(newState,'selections')) {
                // @ts-ignore
                const newSelections = newState?.selections
                // @ts-ignore
                newItem.selections = newSelections
            }
            setState({
                checkingObj: newCheckingObj,
            })
        }

        vscode.postMessage({
            command: "saveCheckingData",
            text: "Webview save check settings",
            data: newState,
        });

        // @ts-ignore
        const nextContextId = newState && newState.nextContextId
        if (nextContextId && Object.keys(nextContextId).length) {
            secretProvider.setItem(getContextIdKey(projectKey), nextContextId);
        } else {
            secretProvider.setItem(getContextIdKey(projectKey), currentContextId);
        }
    }

    /**
     * search checkingData for check that matches currentContextId and return location within checkingData
     * @param currentContextId
     * @param checkingData
     */
    function findCheckToUpdate(currentContextId:{}, checkingData:{}) {
        let foundCheck:null|object = null;
        let foundCatagoryId = '';
        let foundGroupId = '';
        let foundIndex = -1;
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
                    foundCatagoryId = catagoryId;
                    foundGroupId = _groupId;
                    foundIndex = index
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
        return {
            check: foundCheck,
            catagoryId: foundCatagoryId,
            groupId: foundGroupId,
            index: foundIndex,
        };
    }

    return (
      <>
          <AuthContextProvider
            storageProvider={secretProvider}
            ready={!!(checkingObj && Object.keys(checkingObj).length)}
          >
              {/*<StoreContextProvider>*/}
              <TranslationCheckingPane
                checkingObj={checkingObj}
                createNewOlCheck={createNewOlCheck}
                initialContextId={initialContextId}
                openCheckingFile={openCheckingFile}
                previousTranslations={previousTranslations}
                projectKey={projectKey}
                promptUserForOptionCallback={promptUserForOptionCallback}
                saveCheckingData={saveCheckingData}
                uploadToDCS={uploadToDCS}
              />
              {/*</StoreContextProvider>*/}
          </AuthContextProvider>
      </>
    );
}

export default TranslationCheckingView;
