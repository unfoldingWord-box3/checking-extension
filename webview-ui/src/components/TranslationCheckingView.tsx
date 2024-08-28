// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect } from "react";
import { vscode } from "../utilities/vscode";
import "../css/styles.css";
import {
    Checker,
    TranslationUtils,
    twArticleHelpers,
}
// @ts-ignore
from 'checking-tool-rcl'
// @ts-ignore
import AuthContextProvider from '../dcs/context/AuthContext'

import type { TnTSV } from "../../../types/TsvTypes"
import { ResourcesObject } from "../../../types/index";
import { ALL_BIBLE_BOOKS } from "../../../src/utilities/BooksOfTheBible";
import { AppBar, IconButton, makeStyles, Toolbar, Typography } from "@material-ui/core";
import MenuIcon from '@material-ui/icons/Menu'
// @ts-ignore
import { APP_NAME, APP_VERSION } from "../common/constants.js";
// @ts-ignore
import CommandDrawer from "../dcs/components/CommandDrawer.jsx";
// @ts-ignore
const isEqual = require('deep-equal');


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


const showDocument = true // set this to false to disable showing ta or tw articles

console.log("TranslationCheckingView.tsx")

const loadLexiconEntry = (key:string) => {
    console.log(`loadLexiconEntry(${key})`)
};

/**
 * make sure resource has content has data other than manifest
 * @param resource
 */
function hasResourceData(resource:object) {
    if (resource) {
        // @ts-ignore
        const minCount = resource?.manifest ? 2 : 1;
        // @ts-ignore
        let hasResourceFiles = Object.keys(resource).length >= minCount; // need more that just manifest
        return hasResourceFiles;
    }
    return false
}

function TranslationCheckingView() {
    const classes = useStyles()
    const [noteIndex, setNoteIndex] = useState<number>(0);
    const [CheckingObj, setCheckingObj] = useState<ResourcesObject>({});
    const [currentContextId, setCurrentContextId] = useState<object>({});
    const [drawerOpen, setOpen] = useState(false)
    const [auth, setAuth] = useState({ })

    const LexiconData:object = CheckingObj.lexicons;
    const translations:object = CheckingObj.locales
    // @ts-ignore
    const origBibleId:string = CheckingObj.origBibleId
    // @ts-ignore
    const origBible:object = CheckingObj[origBibleId]?.book
    const alignedGlBible_ = CheckingObj.glt || CheckingObj.ult;
    // @ts-ignore
    const alignedGlBible = alignedGlBible_?.book
    const checks:object = CheckingObj.checks
    // @ts-ignore
    const haveChecks = hasResourceData(checks)
    const targetBible = CheckingObj.targetBible
    let getSecretCallback:any

    const translate = (key:string) => {
        const translation = TranslationUtils.lookupTranslationForKey(translations, key)
        return translation
    };

    const getLexiconData_ = (lexiconId:string, entryId:string) => {
        console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`)
        // @ts-ignore
        const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
        return { [lexiconId]: { [entryId]: entryData } };
    };

    const _saveSelection = (newState:object) => {
        // @ts-ignore
        const selections = newState && newState.selections
        console.log(`_saveSelection - new selections`, selections)
        // @ts-ignore
        const currentContextId = newState && newState.currentContextId
        console.log(`_saveSelection - current context data`, currentContextId)
        // @ts-ignore
        const nextContextId = newState && newState.nextContextId
        currentContextId && setCurrentContextId(nextContextId)
        saveSelectionMessage(newState)
    }

    const contextId = currentContextId || {}
    const project = CheckingObj.project;
    // @ts-ignore
    const bookId = project?.bookId
    // @ts-ignore
    const resourceId = project?.resourceId
    // @ts-ignore
    const languageId = project?.languageId || 'en'
    // @ts-ignore
    const targetLanguageName = CheckingObj.targetBible?.manifest?.language_name
    // @ts-ignore
    const targetLanguageDirection = CheckingObj.targetBible?.manifest?.direction
    // @ts-ignore
    const bookName = ALL_BIBLE_BOOKS[bookId]

    let glWordsData, checkingData, checkType;
    if (resourceId === 'twl') {
        const glTwData: object = CheckingObj.tw;
        glWordsData = glTwData
        checkingData = haveChecks && twArticleHelpers.extractGroupData(checks)
        checkType = 'translationWords'
    } else if (resourceId === 'tn') {
        const glTaData: object = CheckingObj.ta;
        glWordsData = glTaData
        checkingData = haveChecks && twArticleHelpers.extractGroupData(checks)
        checkType = 'translationNotes'
    }

    const bibles = CheckingObj?.bibles
    const targetLanguageDetails = {
        id: languageId,
        name: targetLanguageName || languageId,
        direction: targetLanguageDirection || 'ltr',
        book: {
            id: bookId,
            name: bookName
        }
    }

    async function initiData(data: TnTSV) {
        setCheckingObj(data);
        // @ts-ignore
        const _auth = await secretProvider.getSecret(AuthContextProvider.AUTH_KEY)
        if (!isEqual(auth, _auth)) {
            setAuth(_auth);
        }
    }

    const handleMessage = (event: MessageEvent) => {
        const { command, data } = event.data;
        console.log(`handleMessage`, data)

        const update = (data: TnTSV) => {
            initiData(data);
        };

        const getSecretResponse = (value: string|undefined) => {
            if (getSecretCallback) {
                getSecretCallback(value);
                getSecretCallback = undefined // clear callback after use
            } else {
                console.error(`No handler for getSecret response`)
            }
        };

        const commandToFunctionMapping: CommandToFunctionMap = {
            ["update"]: update,
            ["getSecretResponse"]: getSecretResponse,
        };

        commandToFunctionMapping[command](data);
    };

    const secretProvider = {
        getItem: async (key:string) => {
            let value = await getSecret(key)
            if (value) {
                const valueObj = JSON.parse(value)
                return valueObj
            }
            return { }
        },
        setItem: async (key:string, value:object) => {
            const valueJson = value ? JSON.stringify(value) : ''
            setSecret(key, valueJson)
        },
        removeItem: async (key:string) => {
            setSecret(key, '')
        }
    }

    async function setSecret(key:string, value:string) {
        const promise = new Promise<string>((resolve) => {
            getSecretCallback = resolve
            vscode.postMessage({
                command: "saveSecret",
                text: "Save Secret",
                data: value,
            });
        })
    }

    // @ts-ignore
    async function getSecret(key:string):Promise<string> {
        const promise = new Promise<string>((resolve) => {
            const callback = (value:string) => {
                resolve(value)
            }

            getSecretCallback = callback
            vscode.postMessage({
                command: "getSecret",
                text: "Get Secret",
                data: key,
            });
        })
    }

    function sendFirstLoadMessage() {
        vscode.postMessage({
            command: "loaded",
            text: "Webview first load success",
        });
    }

    function saveSelectionMessage(newState:{}) { // send message back to extension to save new selection to file
        vscode.postMessage({
            command: "saveSelection",
            text: "Webview save selection",
            data: newState,
        });
    }

    useEffect(() => {
        window.addEventListener("message", handleMessage);
        sendFirstLoadMessage();

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    const incrementNoteIndex = () =>
        setNoteIndex((prevIndex) =>
          // @ts-ignore
          prevIndex < CheckingObj[chapter][verse].length - 1
                ? prevIndex + 1
                : prevIndex,
        );
    const decrementNoteIndex = () =>
        setNoteIndex((prevIndex) =>
            prevIndex > 0 ? prevIndex - 1 : prevIndex,
        );

    const handleDrawerOpen = () => {
        if (!drawerOpen) {
            setOpen(true)
        }
    }

    const handleDrawerClose = () => {
        if (drawerOpen) {
            setOpen(false)
        }
    }
    
    const haveCheckingData = hasResourceData(checkingData);
    const hasTargetBibleBook = hasResourceData(CheckingObj?.targetBible);
    const haveResources = hasTargetBibleBook && CheckingObj.validResources && haveCheckingData

    console.log(`TranslationNotesView - redraw haveResources ${!!haveResources}, haveCheckingData ${!!haveCheckingData}, haveChecks ${!!haveChecks}`, CheckingObj)
    function getResourceMissingErrorMsg(CheckingObj:any) {
        let message = "Checking resources missing.";
        if (!hasTargetBibleBook) {
            message = `Target bible missing for ${bookId}.`
        } else if (CheckingObj.validResources) {
            if (!haveCheckingData) {
                message = `Empty checks file: './checking/${CheckingObj?.project?.resourceId}/${bookId}.${CheckingObj?.project?.resourceId}_check'`
            }
        } else {
            message = "Checking resources missing.";
        }
        return message;
    }

    const content = haveResources ? (
      <>
          <AppBar position='static'>
              <Toolbar>
                  <div id='title-bar' className={classes.root}>
                      <IconButton
                        edge='start'
                        className={classes.menuButton}
                        color='inherit'
                        aria-label='menu'
                        onClick={handleDrawerOpen}
                      >
                          <MenuIcon />
                      </IconButton>
                      <Typography
                        variant='h6'
                        className={classes.title}
                        onClick={() => {
                        }}
                      >
                          {`${APP_NAME} - v${APP_VERSION}`}
                      </Typography>
                  </div>
              </Toolbar>
          </AppBar>
          <CommandDrawer
            open={drawerOpen}
            onOpen={handleDrawerOpen}
            onClose={handleDrawerClose}
            checkUnsavedChanges={null}
            resetResourceLayout={null}
            showFeedback={null}
          />
          <div id="checkerWrapper" style={{ marginTop: "10px" }}>
              <Checker
                styles={{ width: '97vw', height: '65vw', overflowX: 'auto', overflowY: 'auto' }}
                alignedGlBible={alignedGlBible}
                bibles={bibles}
                checkingData={checkingData}
                checkType={checkType}
                contextId={contextId}
                getLexiconData={getLexiconData_}
                glWordsData={glWordsData}
                saveSelection={_saveSelection}
                showDocument={showDocument}
                targetBible={targetBible}
                targetLanguageDetails={targetLanguageDetails}
                translate={translate}
              />
          </div>
      </>
    ) : getResourceMissingErrorMsg(CheckingObj);

    return (
      <>
          <AuthContextProvider
            storageProvider={secretProvider}
            auth={auth}
          >
              {/*<StoreContextProvider>*/}
              {content}
              {/*</StoreContextProvider>*/}
          </AuthContextProvider>
      </>
    );
}

export default TranslationCheckingView;
