// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect } from "react";
import {
    VSCodePanels,
    VSCodePanelTab,
    VSCodePanelView,
} from "@vscode/webview-ui-toolkit/react";
import { vscode } from "../utilities/vscode";
import "./TranslationNotes.css";
import {
    TranslationUtils,
    Checker,
    twArticleHelpers,
}
// @ts-ignore
from 'checking-tool-rcl'

import TranslationNoteScroller from "./TranslationNoteScroller";
import type { TnTSV } from "../../../types/TsvTypes"
import { ResourcesObject } from "../../../types/index";
import { ALL_BIBLE_BOOKS } from "../../../src/utilities/BooksOfTheBible";

type CommandToFunctionMap = Record<string, (data: any) => void>;

type TranslationNotesViewProps = {
    chapter: number;
    verse: number;
};

console.log("TranslationNotesView.tsx")

const loadLexiconEntry = (key:string) => {
    console.log(`loadLexiconEntry(${key})`)
};

function TranslationNotesView() {
    const [noteIndex, setNoteIndex] = useState<number>(0);
    const [CheckingObj, setCheckingObj] = useState<ResourcesObject>({});
    
    // TODO: Implement this if in Codex!
    // const changeChapterVerse = (ref: VerseRefGlobalState): void => {
    //     const { verseRef } = ref;
    //     const { chapter: newChapter, verse: newVerse } =
    //         extractBookChapterVerse(verseRef);

    //     setChapter(newChapter);
    //     setVerse(newVerse);
    //     setNoteIndex(0);
    // };

    const LexiconData:object = CheckingObj.lexicons;
    const translations:object = CheckingObj.locales
    const glTwl:object = CheckingObj.twl
    const glTwData:object = CheckingObj.tw
    // @ts-ignore
    const origBibleId:string = CheckingObj.origBibleId
    // @ts-ignore
    const origBible:object = CheckingObj[origBibleId]?.book
    const alignedGlBible_ = CheckingObj.glt || CheckingObj.ult;
    // @ts-ignore
    const alignedGlBible = alignedGlBible_?.book
    const checks:object = CheckingObj.checks
    // @ts-ignore
    const haveCheckingData = checks && Object.keys(checks).length
    const checkingData = haveCheckingData && twArticleHelpers.extractGroupData(checks)
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


    const contextId = {}
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
    
    const haveResources = CheckingObj.validResources && checkingData
    console.log(`TranslationNotesView - redraw`, CheckingObj, haveResources)

    const content = haveResources ? (
      <Checker
        styles={{ maxHeight: '500px', overflowY: 'auto' }}
        alignedGlBible={alignedGlBible}
        bibles={bibles}
        checkingData={checkingData}
        checkType={resourceId}
        contextId={contextId}
        getLexiconData={getLexiconData_}
        glWordsData={glTwData}
        targetBible={targetBible}
        targetLanguageDetails={targetLanguageDetails}
        translate={translate}
      />
    ) : (
      "Checking resources missing."
    );

    return (
        <div>
            {content}
        </div>
    );
}

export default TranslationNotesView;
