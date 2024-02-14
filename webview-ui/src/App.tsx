// import { vscode } from "./utilities/vscode";
import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from "@vscode/webview-ui-toolkit/react";
import "./App.css";
import "./codicon.css";

import TranslationNoteScroller from "./components/TranslationNoteScroller";
import type { ScriptureTSV } from "scripture-tsv";

const TITUS_1_1_TSV: ScriptureTSV = {
  1: {
    1: [
      {
        Reference: "1:1",
        ID: "h5gl",
        Tags: "",
        SupportReference: "rc://*/ta/man/translate/figs-exclusive",
        Quote: "",
        Occurrence: "0",
        Note: "Though this letter is from Paul and Timothy to the Colossian believers, later in the letter Paul makes it clear that he is the writer. Most likely Timothy was with him and wrote the words down as Paul spoke. Throughout this letter the words “we,” “our,” and “ours” include the Colossians unless noted otherwise. The words “you,” “your,” and “yours” refer to the Colossian believers and so are plural unless noted otherwise. (See: [[rc://*/ta/man/translate/figs-exclusive]] and [[rc://*/ta/man/translate/figs-you]])",
      },
      {
        Reference: "1:1",
        ID: "fny3",
        Tags: "",
        SupportReference: "",
        Quote: "ἀπόστολος Χριστοῦ Ἰησοῦ διὰ θελήματος Θεοῦ",
        Occurrence: "1",
        Note: "“whom God chose to be an apostle of Christ Jesus”",
      },
    ],
  },
};

function App() {
  const BOOK = 
  
  // TODO: Implement note navigation
  // function handleNoteNavigation() {
  //   vscode.postMessage({
  //     command: "next note",
  //     text: "Navigating verse notes",
  //   });
  // }

  return (
    <main>
      <section className="translation-note-view">
        <VSCodePanels activeid="tab-verse" aria-label="note-type-tab">
          {/* <VSCodePanelTab id="tab-book">BOOK NOTES</VSCodePanelTab> */}
          {/* <VSCodePanelTab id="tab-chapter">CHAPTER NOTES</VSCodePanelTab> */}
          <VSCodePanelTab id="tab-verse">VERSE NOTES</VSCodePanelTab>
          {/* <VSCodePanelView id="view-book">Problems content.</VSCodePanelView> */}
          {/* <VSCodePanelView id="view-chapter">Output content.</VSCodePanelView> */}
          <VSCodePanelView id="view-verse">
            <TranslationNoteScroller tsvs={TITUS_1_1_TSV} />
          </VSCodePanelView>
        </VSCodePanels>
      </section>
    </main>
  );
}

export default App;
