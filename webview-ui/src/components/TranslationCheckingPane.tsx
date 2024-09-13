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
import isEqual from 'deep-equal'

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

type GetLexiconDataFunction = (lexiconId:string, entryId:string) => { };
type SaveSelectionFunction = (resources: ResourcesObject) => void;

type TranslationCheckingProps = {
    checkingObj: ResourcesObject;
    saveSelection: SaveSelectionFunction;
};

const TranslationCheckingPane: React.FC<TranslationCheckingProps> = ({
  checkingObj,
  saveSelection
 }) => {
    const classes = useStyles()
    const [noteIndex, setNoteIndex] = useState<number>(0);
    const [currentContextId, setCurrentContextId] = useState<object>({});
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
        // @ts-ignore
        saveSelection(newState)
    }

    const contextId = currentContextId || {}
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
    ) : getResourceMissingErrorMsg(checkingObj);
}

export default TranslationCheckingPane;
