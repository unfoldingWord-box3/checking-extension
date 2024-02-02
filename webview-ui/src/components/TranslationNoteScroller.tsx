import React from "react";
import type { ScriptureTSV } from "scripture-tsv";

import TranslationNote from "./TranslationNote";
import "./TranslationNoteScroller.css";

const TranslationNoteScroller = ({ tsvs }: { tsvs: ScriptureTSV }) => {
  return (
    <div>
      <div id="note-position">Top Element</div>

      {/* Container for the three elements side by side */}
      <div className="column-container">
        {/* Left Button */}
        <button className="arrow-button">Left</button>

        {/* Middle Element */}
        <div id="note-container">
          <TranslationNote note={tsvs[1][1][0]} />
        </div>

        {/* Right Button */}
        <button className="arrow-button">Right</button>
      </div>
    </div>
  );
};

export default TranslationNoteScroller;
