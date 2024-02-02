import type { ReferenceString, IDString } from "scripture-tsv";

/**
 * A string representing the original words (Hebrew/Greek) that the note represents
 */
export type OrigQuote = string;

/**
 * A string representing a number
 */
export type NumericString = string;

/**
 * A string containing markdown content
 */
export type MarkdownString = string;

export type TranslationNoteType = {
  Reference: ReferenceString;
  ID: IDString;
  Tags: string;
  SupportReference: string;
  Quote: OrigQuote;
  Occurrence: NumericString;
  Note: MarkdownString;
};
