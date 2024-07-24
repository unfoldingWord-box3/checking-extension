"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// import { vscode } from "./utilities/vscode";
const react_1 = __importStar(require("react"));
const vscode_1 = require("../utilities/vscode");
require("../css/styles.css");
const checking_tool_rcl_1 = require("checking-tool-rcl");
const BooksOfTheBible_1 = require("../../../src/utilities/BooksOfTheBible");
const showDocument = true; // set to false to disable showing ta or tw document
console.log("TranslationCheckingView.tsx");
const loadLexiconEntry = (key) => {
    console.log(`loadLexiconEntry(${key})`);
};
function TranslationCheckingView() {
    const [noteIndex, setNoteIndex] = (0, react_1.useState)(0);
    const [CheckingObj, setCheckingObj] = (0, react_1.useState)({});
    const [currentContextId, setCurrentContextId] = (0, react_1.useState)({});
    // TODO: Implement this if in Codex!
    // const changeChapterVerse = (ref: VerseRefGlobalState): void => {
    //     const { verseRef } = ref;
    //     const { chapter: newChapter, verse: newVerse } =
    //         extractBookChapterVerse(verseRef);
    //     setChapter(newChapter);
    //     setVerse(newVerse);
    //     setNoteIndex(0);
    // };
    const LexiconData = CheckingObj.lexicons;
    const translations = CheckingObj.locales;
    // @ts-ignore
    const origBibleId = CheckingObj.origBibleId;
    // @ts-ignore
    const origBible = CheckingObj[origBibleId]?.book;
    const alignedGlBible_ = CheckingObj.glt || CheckingObj.ult;
    // @ts-ignore
    const alignedGlBible = alignedGlBible_?.book;
    const checks = CheckingObj.checks;
    // @ts-ignore
    const haveCheckingData = checks && Object.keys(checks).length;
    const targetBible = CheckingObj.targetBible;
    const translate = (key) => {
        const translation = checking_tool_rcl_1.TranslationUtils.lookupTranslationForKey(translations, key);
        return translation;
    };
    const getLexiconData_ = (lexiconId, entryId) => {
        console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`);
        // @ts-ignore
        const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
        return { [lexiconId]: { [entryId]: entryData } };
    };
    const _saveSelection = (newState) => {
        // @ts-ignore
        const selections = newState && newState.selections;
        console.log(`_saveSelection - new selections`, selections);
        // @ts-ignore
        const currentContextId = newState && newState.currentContextId;
        console.log(`_saveSelection - current context data`, currentContextId);
        // @ts-ignore
        const nextContextId = newState && newState.nextContextId;
        currentContextId && setCurrentContextId(nextContextId);
        saveSelectionMessage(newState);
    };
    const contextId = currentContextId || {};
    const project = CheckingObj.project;
    // @ts-ignore
    const bookId = project?.bookId;
    // @ts-ignore
    const resourceId = project?.resourceId;
    // @ts-ignore
    const languageId = project?.languageId || 'en';
    // @ts-ignore
    const targetLanguageName = CheckingObj.targetBible?.manifest?.language_name;
    // @ts-ignore
    const targetLanguageDirection = CheckingObj.targetBible?.manifest?.direction;
    // @ts-ignore
    const bookName = BooksOfTheBible_1.ALL_BIBLE_BOOKS[bookId];
    let glWordsData, checkingData, checkType;
    if (resourceId === 'twl') {
        const glTwData = CheckingObj.tw;
        glWordsData = glTwData;
        checkingData = haveCheckingData && checking_tool_rcl_1.twArticleHelpers.extractGroupData(checks);
        checkType = 'translationWords';
    }
    else if (resourceId === 'tn') {
        const glTaData = CheckingObj.ta;
        glWordsData = glTaData;
        checkingData = haveCheckingData && checking_tool_rcl_1.twArticleHelpers.extractGroupData(checks);
        checkType = 'translationNotes';
    }
    const bibles = CheckingObj?.bibles;
    const targetLanguageDetails = {
        id: languageId,
        name: targetLanguageName || languageId,
        direction: targetLanguageDirection || 'ltr',
        book: {
            id: bookId,
            name: bookName
        }
    };
    const handleMessage = (event) => {
        const { command, data } = event.data;
        console.log(`handleMessage`, data);
        const commandToFunctionMapping = {
            ["update"]: (data) => {
                setCheckingObj(data);
            },
            // ["changeRef"]: (data: VerseRefGlobalState) =>
            //     changeChapterVerse(data),
        };
        commandToFunctionMapping[command](data);
    };
    function sendFirstLoadMessage() {
        vscode_1.vscode.postMessage({
            command: "loaded",
            text: "Webview first load success",
        });
    }
    function saveSelectionMessage(newState) {
        vscode_1.vscode.postMessage({
            command: "saveSelection",
            text: "Webview save selection",
            data: newState,
        });
    }
    (0, react_1.useEffect)(() => {
        window.addEventListener("message", handleMessage);
        sendFirstLoadMessage();
        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);
    const incrementNoteIndex = () => setNoteIndex((prevIndex) => 
    // @ts-ignore
    prevIndex < CheckingObj[chapter][verse].length - 1
        ? prevIndex + 1
        : prevIndex);
    const decrementNoteIndex = () => setNoteIndex((prevIndex) => prevIndex > 0 ? prevIndex - 1 : prevIndex);
    const haveResources = CheckingObj.validResources && checkingData;
    console.log(`TranslationNotesView - redraw`, CheckingObj, haveResources);
    function getResourceMissingErrorMsg(CheckingObj) {
        let message = "Checking resources missing.";
        if (!CheckingObj?.targetBible) {
            message = `Target bible missing for ${bookId}.`;
        }
        return message;
    }
    const content = haveResources ? (<div id="checkerWrapper">
          <checking_tool_rcl_1.Checker styles={{ width: '97vw', height: '65vw', overflowX: 'auto', overflowY: 'auto' }} alignedGlBible={alignedGlBible} bibles={bibles} checkingData={checkingData} checkType={checkType} contextId={contextId} getLexiconData={getLexiconData_} glWordsData={glWordsData} saveSelection={_saveSelection} showDocument={showDocument} targetBible={targetBible} targetLanguageDetails={targetLanguageDetails} translate={translate}/>
      </div>) : getResourceMissingErrorMsg(CheckingObj);
    return (<>
          {content}
      </>);
}
exports.default = TranslationCheckingView;
//# sourceMappingURL=TranslationCheckingView.js.map