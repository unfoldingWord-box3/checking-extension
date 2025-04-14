import * as fuzz from "fuzzball";
// @ts-ignore
import { AlignmentHelpers, UsfmFileConversionHelpers } from 'word-aligner-lib';
import { AIPromptTemplate, sortByScore } from "./llmUtils";
import { csvToObjects, objectToCsv } from "./tsvUtils";
// @ts-ignore
import { groupDataHelpers, verseHelpers } from 'word-aligner-lib';
import {
  normalizer,
  tokenize,
  tokenizeOrigLang,
  // @ts-ignore
} from 'string-punctuation-tokenizer';

export type AlignmentElementType = Array<{
  text: string;
  occurrences: number;
  ref: string[];
}>;
export type AlignmentMapType = Record<string, AlignmentElementType>;
export type ScoredTranslationType = { sourceText: string; targetText: string; score: number };

/**
 * This function adds content from an alignment object to the original language array and recursively processes
 * children of the alignment object to add their text content to the target language array.
 *
 * @param {any[]} origLang - The array representing the original language where the content will be added.
 * @param {Object} alignment - The alignment object whose content and children are to be processed.
 * @param {any[]} targetLang - The array representing the target language where the text from child nodes will be added.
 * @return {void} This function does not return a value.
 */
export function addOriginalAlignment(origLang: any[], alignment: any, targetLang: any[]) {
  origLang.push(normalizer(alignment.content));
  for (const child of alignment.children || []) {
    const tag = child.tag;
    if (tag === "w") {
      targetLang.push(normalizer(child.text));
    } else
    if (tag === 'zaln') {
      addOriginalAlignment(origLang, child, targetLang);
    }
  }
}

/**
 * Finds the best matching text strings between an input quote and a provided alignment map,
 * based on a scoring mechanism. The function returns a list of the top matches with their
 * corresponding source text, target text, and calculated score.
 *
 * @param {string} quoteStr - The input quote string to be compared against the alignment map.
 * @param {AlignmentMapType} alignmentMap_ - An object mapping source strings to their respective matches and occurrences.
 * @param {number} matchCount - The maximum number of best matches to return.
 *
 * @return {ScoredTranslationType[]} - A list of top matches containing the source text, target text, and calculated score.
 */
export function findBestMatches(quoteStr: string, alignmentMap_: AlignmentMapType, matchCount: number) {
  type ScoredMatchType = Record<string, { score: number; match: AlignmentMapType[string] }>;
  const orderedMatches: ScoredMatchType = {};
  const topMatches: ScoredTranslationType[] = [];

  const originalWords = alignmentMap_ && Object.keys(alignmentMap_);
  if (originalWords?.length) {
    for (const originalStr of originalWords) {
      const score = fuzz.ratio(originalStr, quoteStr);
      // console.log(`changedCurrentCheck - originalStr ${originalStr}, score ${score}`);
      if (score) {
        orderedMatches[originalStr] = { score, match: alignmentMap_[originalStr] };
      }
    }
    const orderedList = Object.entries(orderedMatches)
      .sort(([, a], [, b]) => b.score - a.score)
      .map(([key, value]) => ({ original: key, ...value }));

    // console.log(`changedCurrentCheck - orderedMatches`, orderedMatches, orderedList);

    for (const item of orderedList.slice(0, matchCount)) {
      const targetMatches = item?.match;
      const sourceText = item?.original;
      const totalOccurrences = targetMatches?.reduce((acc, curr) => acc + curr?.occurrences, 0);  
      for (const match of targetMatches) {
        const targetStr = match?.text;
        const occurrences = match?.occurrences;
        const score = Math.round(item?.score) + occurrences / totalOccurrences;
        topMatches.push({ sourceText: sourceText, score, targetText: targetStr });
      }
    }
  }
  return topMatches;
}

export function makeString(origLang: string | string[]) {
  return (Array.isArray(origLang)) ? origLang.join(" ") : origLang;
}

/**
 * Adds a translation mapping between an original language string or array of strings and a target language string or array of strings to an alignment map.
 * Updates occurrences and reference information if the mapping already exists; otherwise, creates a new mapping entry.
 *
 * @param {string|string[]} origLang - The original language text or array of texts.
 * @param {string|string[]} targetLang - The target language text or array of texts.
 * @param {AlignmentMapType} alignmentMap_ - The alignment map object to update with the new translation mapping.
 * @param {string} verseRef - The reference string associated with the translation (e.g., verse reference).
 * @return {void} Updates the alignment map object with the translation mapping.
 */
export function addTranslationToMap(origLang: string|string[], targetLang: string|string[], alignmentMap_: AlignmentMapType, verseRef: string) {
  const origStr = makeString(origLang).toLowerCase();
  const targetStr = makeString(targetLang).toLowerCase();
  const mapEntry:AlignmentElementType = alignmentMap_[origStr] as AlignmentElementType;
  if (mapEntry) {
    // @ts-ignore
    const pos = mapEntry.findIndex(entry => entry?.text === targetStr);
    if (pos >= 0) {
      mapEntry[pos].occurrences += 1;
      mapEntry[pos].ref?.push(verseRef);
    } else {
      alignmentMap_[origStr].push({ text: targetStr, occurrences: 1, ref: [verseRef] });
    }
  } else {
    alignmentMap_[origStr] = [{ text: targetStr, occurrences: 1, ref: [verseRef] }];
  }
}

/**
 * Processes the target book and adds alignment mappings for a specific Bible book.
 *
 * @param {object} targetBook - The object representing the target book containing chapters and verses.
 * @param {string} bookId - The identifier of the Bible book being processed.
 * @param {AlignmentMapType} alignmentMap_ - A map where original language strings are aligned to target language strings, with metadata such as occurrences and references.
 * @return {void} Does not return a value.
 */
export function addAlignmentsForBibleBook(targetBook: object, bookId:string, alignmentMap_: AlignmentMapType ) {
  // @ts-ignore
  const chapterData = targetBook?.chapters ? targetBook.chapters : targetBook;
  const chapters = Object.keys(chapterData);
  if (chapters?.length) {
    for (const chapter of chapters) {
      if (chapter === "manifest" || chapter === "headers") {
        continue; // skip over
      }

      // @ts-ignore
      const verses = chapterData[chapter] || {};
      const chapterRef = `${bookId} ${chapter}`;
      for (const verse of Object.keys(verses)) {
        const verseRef = `${chapterRef}:${verse}`;
        const verseData = verses[verse];
        const alignments = AlignmentHelpers.getVerseAlignments(verseData?.verseObjects);
        // console.log(`${chapter}:${verse} - alignments ${alignments}`)

        for (const alignment of alignments || []) {
          const origLang: string[] = [];
          const targetLang: string[] = [];
          if (alignment.tag === "zaln") {
            addOriginalAlignment(origLang, alignment, targetLang);
          }
          addTranslationToMap(origLang, targetLang, alignmentMap_, verseRef);
        }
      }
    }
  }
}

/**
 * Processes and retrieves a quote string from the provided context object.
 *
 * @param {object} contextId - The object containing the quote string or related data.
 * @return {string} The processed quote string, potentially converted to lowercase and concatenated if it is an array.
 */
export function getQuoteStr(contextId: object) {
  // @ts-ignore
  let quoteStr = (contextId?.quoteStr || contextId?.quoteString || contextId?.quote)?.toLowerCase();
  if (Array.isArray(quoteStr)) {
    quoteStr = quoteStr.join(" ");
  }
  return quoteStr;
}

/**
 * Generates an AI prompt by formatting translation matches into a CSV
 * and replacing placeholders in a template string.
 *
 * @param {object[]} topMatches - An array of match objects, where each object contains
 *                                information about the translation matches, including score,
 *                                target text, and source text.
 *                                These are used to generate a CSV.
 * @param {string} verseText - The translated text to be embedded in the AI prompt.
 * @param {string} quoteStr - The source word or phrase to be included in the AI prompt.
 * @return {string} The constructed AI prompt with placeholders replaced by the provided parameters.
 */
export function buildAiPrompt(topMatches: object[], verseText:string, quoteStr: string) {
  // build translation tables as csv
  const headers = [
    { key: "score" },
    { key: "targetText" },
    { key: "sourceText" },
  ];
  const orderedTsv = objectToCsv(headers, topMatches);
  // console.log(`changedCurrentCheck - sortedTopMatches`, orderedTsv);

  // build AI prompt
  const prompt = AIPromptTemplate.replaceAll("{translationCsv}", orderedTsv.join("\n"))
    .replaceAll("{translatedText}", verseText)
    .replaceAll("{sourceWord}", quoteStr);
  console.log(`changedCurrentCheck - prompt`, prompt);
  return prompt;
}

/**
 * Finds and returns the top matches for a given quote based on an alignment map.
 *
 * @param {string} quoteStr - The input quote for which top matches are determined.
 * @param {AlignmentMapType} alignmentMap_ - The alignment map used to find matches for the quote.
 * @return {ScoredTranslationType[]} An array of objects representing the top matches for the input quote.
 */
export function getTopMatchesForQuote(quoteStr: string, alignmentMap_: AlignmentMapType) {
  const topMatches: ScoredTranslationType[] = [];
  const quotes = quoteStr.split(" ");
  const matchCount = (quotes.length > 1) ? 10 : 15;

  for (const quote of quotes) { // for each word get best translations
    const topMatches_: ScoredTranslationType[] = findBestMatches(quote, alignmentMap_, matchCount);
    const sortedTopMatches = sortByScore(topMatches_).slice(0, matchCount);
    const highScore = sortedTopMatches[0]?.score;
    // rescale so top match is a 1000
    const factor = 100 / Math.round(highScore);
    for (const topMatch of sortedTopMatches) {
      const score = Math.floor(topMatch.score)
      const occurrences = topMatch.score - score;
      topMatch.score = Math.round((score * factor + occurrences) * 1000) / 1000;
    }
    topMatches.push(...sortedTopMatches);
  }
  return topMatches.filter(match => match.score > 1);
}

/**
 * Cleans up a verse by tokenizing, normalizing, and reconstructing the text.
 *
 * @param {string} verseText - The raw verse text to be processed.
 * @return {string} The cleaned and normalized verse text.
 */
export function cleanupVerse(verseText:string) {
  const cleanWords = tokenize({ text: verseText, includePunctuation: false, normalize: true })
  // @ts-ignore
  const cleanText = cleanWords.join(" ");
  return cleanText;
} // normalize

/**
 * Finds alignment suggestions by matching the quote in the given context, searching
 * the alignment map, ranking possible matches, and creating an AI prompt with the closest
 * matches.
 *
 * @param {object} contextId - The context object containing details for the current alignment process,
 *                             such as the quote string or reference information.
 * @param {AlignmentMapType} alignmentMap_ - The alignment map containing mappings of source
 *                                           language strings to target language translations,
 *                                           along with metadata like scores and references.
 * @param {object} targetBible - The object representing the Bible content, used to extract
 *                               verse text for the AI prompt.
 * @return {string} A prompt to pass to AI to get the best translation.
 */
export function findAlignmentSuggestions(contextId: object, alignmentMap_: AlignmentMapType, targetBible: object) {
  if (contextId) {
    const quoteStr = normalize(getQuoteStr(contextId));
    // @ts-ignore
    let verseText = verseHelpers.getVerseTextFromBible(targetBible, contextId?.reference)
    // @ts-ignore
    verseText = cleanupVerse(verseText);

    if (quoteStr) {
      const topMatches = getTopMatchesForQuote(quoteStr, alignmentMap_);
      const prompt = buildAiPrompt(topMatches, verseText, quoteStr);
      return prompt;
    }
  }
}

/**
 * Adds alignments data for flattened group data to the alignment map.
 *
 * @param {object} flattenedGroupsData - The group data after being flattened, containing information for each group.
 * @param {string} bookId - The ID of the book for which the alignments are being added.
 * @param {AlignmentMapType} alignmentMap_ - The map where alignments are being stored, updated with the given data.
 * @return {void} This function does not return a value.
 */
export function addAlignmentsForFlattenedGroupData(flattenedGroupsData:object, bookId: string, alignmentMap_: AlignmentMapType) {
  for (const groupId of Object.keys(flattenedGroupsData)) {
    // @ts-ignore
    const checkList = flattenedGroupsData[groupId];
    for (const check of checkList) {
      const contextId = check?.contextId;
      const origLang = getQuoteStr(contextId);
      const reference = contextId?.reference;
      const chapterRef = `${bookId} ${reference?.chapter}`;
      const verseRef = `${chapterRef}:${reference?.verse}`;
      // @ts-ignore
      const targetStr = check?.selections && check?.selections?.map(s => s.text);
      if (origLang && targetStr) {
        addTranslationToMap(origLang, targetStr, alignmentMap_, verseRef);
      }
    }
  }
}

/**
 * Adds alignments for checking data  to the alignment map.
 *
 * @param {object} checkingData - The data used for checking alignments.
 * @param {string} bookId - The identifier for the book related to the alignments.
 * @param {AlignmentMapType} alignmentMap_ - The alignment map to be updated with the processed data.
 * @return {void} - Does not return a value.
 */
export function addAlignmentsForCheckingData(checkingData:object, bookId: string, alignmentMap_: AlignmentMapType) {
  const groupsData = groupDataHelpers.extractGroupData(checkingData);
  const flattenedGroupsData = groupDataHelpers.flattenGroupData(groupsData);
  addAlignmentsForFlattenedGroupData(flattenedGroupsData, bookId, alignmentMap_);
}

/**
 * Normalizes the input string by applying a predefined normalization function.
 *
 * @param {string} word - The input string to be normalized.
 * @return {string} The normalized version of the input string.
 */
export function normalize(word:string) {
  let word_ = normalizer(word || '');
  return word_;
}

export function tokenizeQuote(quote:string, isOrigLang = false, includePunctuation = true) {
  if (isOrigLang) {
    return tokenizeOrigLang({ text: quote, includePunctuation });
  } else {
    return tokenize({ text: quote, includePunctuation });
  }
}

export type scoredTranslationType = Array<{ sourceText: string; translatedText: string; score: number }>;

/**
 * Parses a CSV string containing translations and their respective scores,
 * converts the score values into numerical format, and returns the parsed data.
 *
 * @param {string} csvLines - The input CSV string containing translation information and scores.
 * @return {scoredTranslationType} An array of objects representing the parsed translations and their numerical scores.
 */
export function getScoredTranslations(csvLines:string) {
  const { csvItems } = csvToObjects(csvLines) as { csvItems: any[] };
  if (csvItems) {
    // remove double quotes
    for (const csvItem of csvItems) {
      const key = 'score'
      const value = csvItem[key]
      if (value) {
        csvItem[key] = parseFloat(value)
      }
    }
  }
  return csvItems as scoredTranslationType;
}

type TargetScores = Array<{ targetText: string; index: number; score: number }>;
type MatchedTranslationsType = Array<{
  targetScores: TargetScores;
  sourceText: string;
  translatedText: string;
  score: number
}>;

export function highlightBestWordsInTranslation(sourceText: string, targetText: string, scoredTranslations: scoredTranslationType) {
  const sourceWords = sourceText.split(" ").map(w => normalizer(w).trim());
  const targetWords = targetText.split(" ").map(w => normalizer(w).trim());
  let highlightedWords:{ targetText: string, sourceText: string, index: number, score: number }[] = []
  const dupeCheck: Record<string, number[]> = {};

  for (let tIndex = 0; tIndex < scoredTranslations.length; tIndex++) {
    const t = scoredTranslations[tIndex];
    const targetTextSplit = normalizer(t.translatedText)?.split(" ") || [];
    const initialScore = t.score;
    for (let index = 0; index < targetWords.length; index++) {
      const targetWord = targetWords[index];
      for (let singleTargetWordIndex = 0; singleTargetWordIndex < targetTextSplit.length; singleTargetWordIndex++) {
        const singleTargetWord = targetTextSplit[singleTargetWordIndex];
        
        // get best match to targetWord
        const targetFuzzScore = fuzz.ratio(singleTargetWord, targetWord);
        if (!(targetFuzzScore > 1)) {
          continue; // if no match, then skip
        }

        // get best match to sourceWord
        let highestSourceText = '';
        let highSourceFuzzScore = 0;
        const sourceTextToMatch = normalizer(t.sourceText);
        for (let i = 0; i < sourceWords.length; i++) {
          const sourceWord = sourceWords[i];
          const sourceFuzzScore = fuzz.ratio(sourceTextToMatch, sourceWord);
          if (sourceFuzzScore > highSourceFuzzScore) {
            highestSourceText = sourceWord;
            highSourceFuzzScore = sourceFuzzScore;
          }
        }
        
        const combinedScore = (targetFuzzScore / 100) * (highSourceFuzzScore / 100) * initialScore;
        if (!(highSourceFuzzScore > 1)) {
          continue; // if no match, then skip
        }
        
        let saveTarget = !highlightedWords[index];
        if (!saveTarget) { // if word already found, see if higher score
          const currentScore = highlightedWords[index].score;
          if (currentScore < combinedScore) { // if new score is a better match, replace it
            saveTarget = true;
          }
        }
        if (saveTarget) {
          let previousMatchBetter = false;
          for (let i = 0; i <index; i++) {
            if (highlightedWords[i]) {
              const previousScore = highlightedWords[i].score
              if (highestSourceText === highlightedWords[i].sourceText) {
                if (previousScore < combinedScore) {
                  delete highlightedWords[i]; // if current match better, remove previous
                } else {
                  previousMatchBetter = true;
                  break
                }
              }
            }
          }
          if (!previousMatchBetter) { // this is better match
            highlightedWords[index] = {
              targetText: targetWord,
              sourceText: highestSourceText,
              index,
              score: combinedScore,
            };
          }
        }
      }
    }
  }
  
  highlightedWords = highlightedWords.filter(item => item)

    // get count of each word
  for (let i = 0; i < highlightedWords.length; i++) {
    const targetWord = highlightedWords[i].targetText;
    if (dupeCheck[targetWord]) {
      dupeCheck[targetWord].push(i);
    } else {
      dupeCheck[targetWord] = [i];
    }
  }

  // double check duplicated translated words
  for (const targetWord in dupeCheck) {
    const dupeList = dupeCheck[targetWord];

    if (dupeList.length > 1) {
      // now see if source words are also duplicated
      for (let i = 0; i < dupeList.length; i++) {
        const index = dupeList[i];
        if (!highlightedWords[index]) { // if already removed, skip
          continue;
        }
        const firstSourceWord = highlightedWords[index].sourceText;
        let sourceDuplicateFound = [];
        for (let j = i + 1; j < dupeList.length; j++) {
          const secondIndex = dupeList[j];
          const secondSourceWord = highlightedWords[secondIndex].sourceText;
          if (firstSourceWord === secondSourceWord) {
            sourceDuplicateFound.push(secondIndex);
          }
        }

        if ((dupeList.length > 1) && (sourceDuplicateFound.length < 1)) {
          // if target duplicated, but source is not, remove extras
          for (const dupeIndex of sourceDuplicateFound) {
            const firstDupeIndex = index;
            const secondDupeIndex = dupeIndex;
            let removeIndex = secondDupeIndex;
            if (highlightedWords[secondDupeIndex].score > highlightedWords[firstDupeIndex].score) {
              removeIndex = firstDupeIndex;
            }
            delete highlightedWords[removeIndex];
          }
        }
      }
    }
  }

  const averageScore = highlightedWords.reduce((sum, word) => sum + word.score, 0) / highlightedWords.length;

  // Sort highlightWords by index in ascending order
  let highlightedWords_ = highlightedWords.sort((a, b) => a.index - b.index);

  if (averageScore < 60) {
    // limit to words above average score
    highlightedWords_ = highlightedWords_.filter(word => word.score > averageScore);
    console.log(`changedCurrentCheck - highlightWords_`, highlightedWords_);
  }

  const foundHighlightedWords = [];
  for (let i = 0; i < targetWords.length; i++) {
    const targetWord = targetWords[i];
    const pos = highlightedWords_.findIndex(w => (w.targetText === targetWord))
    if (pos >= 0) {
      const highlightedWord = highlightedWords_[pos];
      const highlightedWord_ = { 
        ...highlightedWord,
        index: i,
      };
      foundHighlightedWords.push(highlightedWord_)
    }
  }

  return foundHighlightedWords;
}
