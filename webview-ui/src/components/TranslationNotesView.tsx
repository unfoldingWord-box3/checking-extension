// import { vscode } from "./utilities/vscode";
import React, { useState, useEffect } from "react";
import {
    VSCodePanels,
    VSCodePanelTab,
    VSCodePanelView,
} from "@vscode/webview-ui-toolkit/react";
import { vscode } from "../utilities/vscode";
import "./TranslationNotes.css";

import TranslationNoteScroller from "./TranslationNoteScroller";
import type { TnTSV } from "../../../types/TsvTypes"
import { ResourcesObject } from "../../../types/index";

type CommandToFunctionMap = Record<string, (data: any) => void>;

type TranslationNotesViewProps = {
    chapter: number;
    verse: number;
};

console.log("TranslationNotesView.tsx")

const loadLexiconEntry = (key:string) => {
    console.log(`loadLexiconEntry(${key})`)
};

function TranslationNotesView({ chapter, verse }: TranslationNotesViewProps) {
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
    const origBible:object = CheckingObj[origBibleId]
    const alignedGlBible = CheckingObj.glt || CheckingObj.ult
    const checkingData = glTwl; // twArticleHelpers.extractGroupData(glTwl)
    const targetBible = CheckingObj.targetBible

    const translate = (key:string) => {
        const translation = key //TranslationUtils.lookupTranslationForKey(translations, key)
        return translation
    };

    const getLexiconData_ = (lexiconId:string, entryId:string) => {
        console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`)
        // @ts-ignore
        const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
        return { [lexiconId]: { [entryId]: entryData } };
    };


    const bookId = CheckingObj.bookId
    const resourceId = CheckingObj.resourceId

    const contextId = {}
    const languageId = CheckingObj.languageId;
    const project = {
        identifier: bookId,
        languageId
    }

    const bibles = CheckingObj?.bibles

    const handleMessage = (event: MessageEvent) => {
        const { command, data } = event.data;
        1;

        const commandToFunctionMapping: CommandToFunctionMap = {
            ["update"]: (data: TnTSV) => setCheckingObj(data),
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

    // @ts-ignore
    const notes = CheckingObj?.[chapter]?.[verse];
    const content = notes ? (
        <TranslationNoteScroller
            notes={notes || {}}
            currentIndex={noteIndex}
            incrementIndex={incrementNoteIndex}
            decrementIndex={decrementNoteIndex}
        />
    ) : (
        "No translation notes available for this verse."
    );
    
    const haveResources = CheckingObj.validResources && CheckingObj.checking && origBible
    console.log(`commandToFunctionMapping - redraw`, CheckingObj, haveResources)

    return (
        <main>
            <section className="translation-note-view">
                <VSCodePanels activeid="tab-verse" aria-label="note-type-tab">
                    {/* <VSCodePanelTab id="tab-book">BOOK NOTES</VSCodePanelTab> */}
                    {/* <VSCodePanelTab id="tab-chapter">CHAPTER NOTES</VSCodePanelTab> */}
                    <VSCodePanelTab id="tab-verse">VERSE NOTES</VSCodePanelTab>
                    {/* <VSCodePanelView id="view-book">Problems content.</VSCodePanelView> */}
                    {/* <VSCodePanelView id="view-chapter">Output content.</VSCodePanelView> */}
                    <VSCodePanelView id="view-verse">{content}</VSCodePanelView>
                </VSCodePanels>
            </section>
        </main>
    );
}

export default TranslationNotesView;
