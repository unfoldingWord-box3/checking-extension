// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect, useContext } from "react";
import { vscode } from "../utilities/vscode";
import "../css/styles.css";
import {
    Checker,
    TranslationUtils,
    twArticleHelpers,
}
// @ts-ignore
from 'checking-tool-rcl'

import { GeneralObject, ResourcesObject } from "../../../types/index";
import { ALL_BIBLE_BOOKS } from "../../../src/utilities/BooksOfTheBible";
import {
  AppBar,
  CircularProgress,
  IconButton,
  makeStyles,
  Toolbar,
  Typography,
} from "@material-ui/core";
import MenuIcon from '@material-ui/icons/Menu'
import ErrorIcon from '@material-ui/icons/Error';
import DoneOutlineIcon from '@material-ui/icons/DoneOutline';
// @ts-ignore
import { APP_NAME, APP_VERSION } from "../common/constants.js";
// @ts-ignore
import CommandDrawer from "../dcs/components/CommandDrawer.jsx";
// @ts-ignore
import isEqual from 'deep-equal'
// @ts-ignore
import { AuthContext } from "../dcs/context/AuthContext";

const showDocument = true // set this to false, to disable showing ta or tw articles

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


console.log("TranslationCheckingPane.tsx")

/**
 * make sure resource has content data other than manifest
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

type saveCheckingDataFunction = (resources: ResourcesObject) => void;
type uploadToDCSFunction = (server: string, owner: string, token: string, dcsUpdate: (update: object) => void) => Promise<GeneralObject>;

type TranslationCheckingProps = {
    checkingObj: ResourcesObject;
    saveCheckingData: saveCheckingDataFunction;
    uploadToDCS: uploadToDCSFunction;
    initialContextId: object;
    projectKey: string;
};

const TranslationCheckingPane: React.FC<TranslationCheckingProps> = ({
  checkingObj,
  saveCheckingData,
  initialContextId,
  projectKey,
  uploadToDCS: _uploadToDCS
 }) => {
    const classes = useStyles()
    const [noteIndex, setNoteIndex] = useState<number>(0);
    const [currentContextId, setCurrentContextId] = useState<object>(initialContextId || {});
    const [drawerOpen, setOpen] = useState(false)
    const [auth, setAuth] = useState({ })

    const LexiconData:object = checkingObj.lexicons;
    const translations:object = checkingObj.locales
    // @ts-ignore
    const languages:string[] = checkingObj.localeOptions || []
    // @ts-ignore
    const origBibleId:string = checkingObj.origBibleId
    // @ts-ignore
    const origBible:object = checkingObj[origBibleId]?.book
    const alignedGlBible_ = checkingObj.glt || checkingObj.ult;
    // @ts-ignore
    const alignedGlBible = alignedGlBible_?.book
    const checks:object = checkingObj.checks
    // @ts-ignore
    const haveChecks = hasResourceData(checks)
    const targetBible = checkingObj.targetBible

    // @ts-ignore
    const _authContext = useContext(AuthContext);
    // @ts-ignore
    const showDialogContent = _authContext?.actions?.showDialogContent

    useEffect(() => {
      setCurrentContextId(initialContextId)
    }, [initialContextId]);
      
    const translate = (key:string, data:object) => {
        const translation = TranslationUtils.lookupTranslationForKey(translations, key, data)
        return translation
    };

    const getLexiconData_ = (lexiconId:string, entryId:string) => {
        console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`)
        // @ts-ignore
        const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
        return { [lexiconId]: { [entryId]: entryData } };
    };

    const _saveCheckingData = (newState:object) => {
        // @ts-ignore
        const selections = newState?.selections
        console.log(`_saveCheckingData - new selections`, selections)
        // @ts-ignore
        const currentContextId = newState?.currentCheck?.contextId
        console.log(`_saveCheckingData - current context data`, currentContextId)
        // @ts-ignore
        const nextContextId = newState?.nextContextId
        if (currentContextId && nextContextId) {
          setCurrentContextId(nextContextId);
        }
        // @ts-ignore
        saveCheckingData && saveCheckingData(newState)
    }
    
    function saveSettings(settings: GeneralObject) {
      vscode.postMessage({
        command: "saveAppSettings",
        text: "Save APP Settings",
        data: { settings },
      });
    }

    const contextId = initialContextId || {}
    const project = checkingObj.project;
    // @ts-ignore
    const bookId = project?.bookId
    // @ts-ignore
    const resourceId = project?.resourceId
    // @ts-ignore
    const languageId = project?.languageId || 'en'
    // @ts-ignore
    const targetLanguageName = checkingObj.targetBible?.manifest?.language_name
    // @ts-ignore
    const targetLanguageDirection = checkingObj.targetBible?.manifest?.direction
    // @ts-ignore
    const bookName = ALL_BIBLE_BOOKS[bookId]

    let glWordsData, checkingData, checkType;
    if (resourceId === 'twl') {
        const glTwData: object = checkingObj.tw;
        glWordsData = glTwData
        checkingData = haveChecks && twArticleHelpers.extractGroupData(checks)
        checkType = 'translationWords'
    } else if (resourceId === 'tn') {
        const glTaData: object = checkingObj.ta;
        glWordsData = glTaData
        checkingData = haveChecks && twArticleHelpers.extractGroupData(checks)
        checkType = 'translationNotes'
    }

    const bibles = checkingObj?.bibles
    const targetLanguageDetails = {
        id: languageId,
        name: targetLanguageName || languageId,
        direction: targetLanguageDirection || 'ltr',
        book: {
            id: bookId,
            name: bookName
        }
    }
    function _showDialogContent(params: object) {
      showDialogContent && showDialogContent(params)
    }

  function getLogDiv(log: string[]) {
    return (
      <div>
        {
          log.map((item: string) => (
            <>
              <span>{item}</span><br />
            </>
          ))
        }
      </div>
    )
  }

  function uploadToDCS(server:string, owner: string, token: string) {
      _showDialogContent({ message: 'Doing Upload to DCS' })
      let log: string[] = []
      const dcsUpdateCallback = (update: object) => {
        // @ts-ignore
        const status = update?.status || '';
        // @ts-ignore
        log = update?.log || []
        _showDialogContent({
          message:
            <div>
              <CircularProgress /> <b>Upload is in Process</b>
              <br />
              <span><b>{`Current Status: ${status}`}</b></span>
              <hr />
              <b>Log:</b><br />
              {getLogDiv(log)}
            </div>
        })
      }
      _uploadToDCS(server, owner, token, dcsUpdateCallback).then(results => {
        console.log(`uploadToDCS completed with results:`, results)
        // @ts-ignore
        const errorMessage = results?.error;
        if (errorMessage) {
          let message = errorMessage;
          const lastState = results?.lastState;
          if (lastState) {
            const url = `${lastState.server}/${lastState.owner}/${lastState.repo}`
            message = `${message}.  Repo is at ${url}`
          }
          const dialogContent = (
            <div>
              <ErrorIcon /> <b>Upload Failed:</b>
              <br />
              <span>{`Current Status: ${message}`}</span>
              <hr />
              <b>Log:</b><br />
              {getLogDiv(log)}
            </div>
          )
          _showDialogContent({ message: dialogContent });
        } else {
          let message = 'Upload Success'
          const lastState = results?.lastState;
          if (lastState) {
            const url = `${lastState.server}/${lastState.owner}/${lastState.repo}`
            message = `${message} to ${url}`
          }
          const dialogContent =(
            <div>
              <DoneOutlineIcon /> <b>Upload Complete Successfully:</b>
              <br />
              <span>{`Current Status: ${message}`}</span>
              <hr />
              <b>Log:</b><br />
              {getLogDiv(log)}
            </div>
          )
          _showDialogContent({ message: dialogContent });
        }
      })
    }
    
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

    const changeTargetVerse = (chapter:string, verse:string, newVerseText:string, newVerseObjects: object) => {
      if (bookId && chapter && verse) {
        vscode.postMessage({
          command: "changeTargetVerse",
          text: "Change Target Verse",
          data: { bookId, chapter, verse, newVerseText, newVerseObjects },
        });
      }
    }
    
    const haveCheckingData = hasResourceData(checkingData);
    const hasTargetBibleBook = hasResourceData(checkingObj?.targetBible);
    const haveResources = hasTargetBibleBook && checkingObj.validResources && haveCheckingData

    console.log(`TranslationNotesView - redraw haveResources ${!!haveResources}, haveCheckingData ${!!haveCheckingData}, haveChecks ${!!haveChecks}`, checkingObj)
    function getResourceMissingErrorMsg(checkingObj:any) {
        let message = "Checking resources missing.";
        if (!hasTargetBibleBook) {
            message = `Target bible missing for ${bookId}.`
        } else if (checkingObj.validResources) {
            if (!haveCheckingData) {
                message = `Empty checks file: './checking/${checkingObj?.project?.resourceId}/${bookId}.${checkingObj?.project?.resourceId}_check'`
            }
        } else {
            message = "Checking resources missing.";
        }
        return message;
    }

  // @ts-ignore
  const currentLanguageSelection = translations?.['_']?.['full_name'] || '';
  let projectManifest = null
  // @ts-ignore
  let _manifest = checkingObj?.targetBible?.manifest;
  const resourceTitle = _manifest?.resource_title || '';
  if (_manifest) {
    const dublin_core = _manifest?.dublin_core || {}
    let target_language = {  }
    if (dublin_core?.language) {
      target_language = { ...dublin_core.language };
      // @ts-ignore
      target_language.book = {
        name: resourceTitle,
      };
    }
    _manifest = { // shallow copy
      ...dublin_core,
      ..._manifest,
      target_language
    }
  }
  const initialSettings = {
    manifest: _manifest,
    // @ts-ignore
    ...(checkingObj?.metadata?.settings || {})
  }
  
  return haveResources ? (
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
                    <Typography
                      variant='h1'
                      className={classes.title}
                      onClick={() => {
                      }}
                    >
                      {`${resourceTitle}`}
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
            languages={languages}
            currentLanguageSelection={currentLanguageSelection}
            translate={translate}
            uploadToDCS={uploadToDCS}
          />
          <div id="checkerWrapper" style={{ marginTop: "10px" }}>
              <Checker
                styles={{ width: '97vw', height: '65vw', overflowX: 'auto', overflowY: 'auto' }}
                alignedGlBible={alignedGlBible}
                bibles={bibles}
                changeTargetVerse={changeTargetVerse}
                checkingData={checkingData}
                checkType={checkType}
                contextId={contextId}
                getLexiconData={getLexiconData_}
                glWordsData={glWordsData}
                initialSettings={initialSettings}
                saveCheckingData={_saveCheckingData}
                saveSettings={saveSettings}
                showDocument={showDocument}
                targetBible={targetBible}
                targetLanguageDetails={targetLanguageDetails}
                translate={translate}
              />
          </div>
      </>
    ) : getResourceMissingErrorMsg(checkingObj);
}

export default TranslationCheckingPane;
