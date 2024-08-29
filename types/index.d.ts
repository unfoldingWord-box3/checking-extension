import { ScriptureTSV } from "./TsvTypes";

interface VerseRefGlobalState {
  verseRef: string;
  uri: string;
}

export type ResourcesObject = {
  [key: string]: object;
};

export type TranslationCheckingPostMessages =
    | { command: "update"; data: ScriptureTSV }
    | { command: "getSecretResponse"; data: string|undefined };
