import { ScriptureTSV } from "./TsvTypes";

interface VerseRefGlobalState {
  verseRef: string;
  uri: string;
}

export type ResourcesObject = {
  [key: string]: object;
};

export type ResourcesInfo = {
  filePath: string|null;
  resources: ResourcesObject;
};

export type TranslationCheckingPostMessages =
    | { command: "update"; data: ScriptureTSV }
    | { command: "getSecretResponse"; data: object }
    | { command: "uploadToDCSResponse"; data: object }
    | { command: "uploadToDcsStatusResponse"; data: string }
    | { command: "initializeNewGlPrompt"; data: object }
    | { command: "initializeNewGlResponse"; data: object };

export type NestedObject = {
  [key: string]: {
    [innerKey: string]: any;
  };
};

export type GeneralObject = {
  [key: string]: any;
};

export type RepoSelection = {
  owner?: string;
  repoName?: string;
  server?: string;
  error?: string;
};

