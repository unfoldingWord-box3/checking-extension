import { ScriptureTSV } from "./TsvTypes";

interface VerseRefGlobalState {
  verseRef: string;
  uri: string;
}

type TranslationNotePostMessages =
    | { command: "update"; data: ScriptureTSV }
    | { command: "changeRef"; data: VerseRefGlobalState };
