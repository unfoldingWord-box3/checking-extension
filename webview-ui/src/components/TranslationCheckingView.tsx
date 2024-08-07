// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect } from "react";
import { vscode } from "../utilities/vscode";
import "../css/styles.css";
import {
    TranslationUtils,
    Checker,
    twArticleHelpers,
}
// @ts-ignore
from 'checking-tool-rcl'

import type { TnTSV } from "../../../types/TsvTypes"
import { ResourcesObject } from "../../../types/index";
import { ALL_BIBLE_BOOKS } from "../../../src/utilities/BooksOfTheBible";

type CommandToFunctionMap = Record<string, (data: any) => void>;

type TranslationNotesViewProps = {
    chapter: number;
    verse: number;
};

const showDocument = true // set to false to disable showing ta or tw document

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
    const [noteIndex, setNoteIndex] = useState<number>(0);
    const [CheckingObj, setCheckingObj] = useState<ResourcesObject>({});
    const [currentContextId, setCurrentContextId] = useState<object>({});

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

    const handleMessage = (event: MessageEvent) => {
        const { command, data } = event.data;
        console.log(`handleMessage`, data)
        
        const commandToFunctionMapping: CommandToFunctionMap = {
            ["update"]: (data: TnTSV) => {
                setCheckingObj(data);
            },
            // ["changeRef"]: (data: VerseRefGlobalState) =>
            //     changeChapterVerse(data),
        };

        commandToFunctionMapping[command](data);
    };

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
      <div id="checkerWrapper" >
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
    ) : getResourceMissingErrorMsg(CheckingObj);

    return (
      <>
          {content}
      </>
    );
}

export default TranslationCheckingView;
