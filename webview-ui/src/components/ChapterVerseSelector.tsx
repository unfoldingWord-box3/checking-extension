import React from 'react'
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";

interface ChapterVerseSelectorProps {
  chapter: number;
  verse: number;
  onChapterChange: (newChapter: number) => void;
  onVerseChange: (newVerse: number) => void;
}

const ChapterVerseSelector: React.FC<ChapterVerseSelectorProps> = ({
  chapter,
  verse,
  onChapterChange,
  onVerseChange,
}) => {
  const handleChapterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChapterChange(Number(event.target.value));
  };

  const handleVerseChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onVerseChange(Number(event.target.value));
  };

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <label style={{ display: "block" }}>
          Chapter
        </label>
        <VSCodeDropdown onInput={handleChapterChange} value={chapter.toString()}>
          {Array.from({ length: 150 }, (_, i) => (
            <VSCodeOption key={i + 1} value={(i + 1).toString()}>
              {i + 1}
            </VSCodeOption>
          ))}
        </VSCodeDropdown>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <label style={{ display: "block" }}>
          Verse
        </label>
        <VSCodeDropdown onInput={handleVerseChange} value={verse.toString()}>
          {Array.from({ length: 176 }, (_, i) => (
            <VSCodeOption key={i + 1} value={(i + 1).toString()}>
              {i + 1}
            </VSCodeOption>
          ))}
        </VSCodeDropdown>
      </div>
    </div>
  );
};

export default ChapterVerseSelector