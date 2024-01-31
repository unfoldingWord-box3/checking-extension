// import { vscode } from "./utilities/vscode";
import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from "@vscode/webview-ui-toolkit/react";
import "./App.css";

function App() {
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
            Coming soon to you... translation notes details
          </VSCodePanelView>
        </VSCodePanels>
      </section>
    </main>
  );
}

export default App;
