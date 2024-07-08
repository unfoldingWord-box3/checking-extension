import { ScriptureTSV } from "./TsvTypes";

interface VerseRefGlobalState {
  verseRef: string;
  uri: string;
}

export type ResourcesObject = {
  [key: string]: object;
};

type TranslationCheckingPostMessages =
    | { command: "update"; data: ScriptureTSV }
    | { command: "changeRef"; data: VerseRefGlobalState };
