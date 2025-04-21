// @ts-ignore
import { AIPromptTemplate, AIPromptTemplate1, AIPromptTemplate2, sortByScore } from "./llmUtils";
import { csvToObjects, objectToCsv } from "./tsvUtils";
// @ts-ignore
import { normalizer, tokenize, tokenizeOrigLang } from "string-punctuation-tokenizer";
// @ts-ignore
import * as fuzz from "fuzzball";
// @ts-ignore
import { AlignmentHelpers, groupDataHelpers, verseHelpers } from "word-aligner-lib";
const math = require('mathjs');

export type AlignmentElementType = {
  text: string;
  occurrences: number;
  ref: string[];
};
type MatchesType = { index: number; score: number };
export type BestPhasesElementType = {
  translation: string;
  rank: number;
};
export type BestHighlightsElementType = {
  highlights: string;
  score?: number;
  matches?: MatchesType[];
};

export type AlignmentMapType = Record<string, AlignmentElementType[]>;
type HighlightedWordsType = { highlight: string, index: number };
export type ScoredTranslationType = {
  sourceText: string;
  translatedText: string;
  quoteWord: string;
  score: number;
  occurrences: number;
  highLightedWords: HighlightedWordsType[];
};

type ScoredMatchElementType = {
  score: number;
  bestTranslationMatch: BestTranslatedWordType[];
  bestOriginalMatch: {
    text: string;
    occurrences: number;
    ref: string[];
    originalText: string;
    quoteWord: string;
    translatedText: string;
  };
};

type TranslatedWordMatchType = { index: number; translatedWord: string, score: number } | null;
type BestTranslatedWordType = {
  score: number;
  matched: TranslatedWordMatchType
};

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
 * corresponding source text, translated text, and calculated score.
 *
 * @param {string} quoteWord - The input quote string to be compared against the alignment map.
 * @param {AlignmentMapType} translatedAlignmentMap - An object mapping translated strings to their respective original language matches and occurrences.
 * @param {number} matchCount - The maximum number of best matches to return.
 *
 * @return {ScoredTranslationType[]} - A list of top matches containing the source text, translated text, and calculated score.
 */
export function findBestMatches(quoteWord: string, translatedAlignmentMap: AlignmentMapType, matchCount: number, translation: string) {
  const topMatches: ScoredTranslationType[] = [];
  const translationWords = tokenize({ text: translation.toLowerCase(), includePunctuation: false, normalize: true })
  quoteWord = normalizer(quoteWord)

  const translatedThreshold = 50;
  const originalThreshold = 70;

  const foundMatches: ScoredMatchElementType[] = []
  const _translatedPhrases = translatedAlignmentMap && Object.keys(translatedAlignmentMap);
  if (_translatedPhrases?.length) {
    for (const _translatedPhrase of _translatedPhrases) { // cycle through the translated phrases in the translation map
      const originalMatches: AlignmentElementType[] = translatedAlignmentMap[_translatedPhrase];
      const _translatedWords = _translatedPhrase.split(' ')
      const bestTranslationMatches: BestTranslatedWordType[] = [];
      let combinedScore = 0;
      for (let i = 0; i < _translatedWords.length; i++) { // cycle through each word of the translated phrase
        const _translatedWord = _translatedWords[i]
        let bestTranslatedWordScore = -1
        let matchedWord:TranslatedWordMatchType = null
        for (let j = 0; j < translationWords.length; j++) { // cycle through words of the given translation
          const translatedWord = translationWords[j];
          const translatedScore = fuzz.ratio(_translatedWord, translatedWord);
          if (translatedScore > bestTranslatedWordScore) {
            bestTranslatedWordScore = translatedScore;
            matchedWord = { index: j, translatedWord, score: translatedScore };
          }
        }

        bestTranslationMatches[i] = { score: bestTranslatedWordScore, matched: matchedWord }
        combinedScore += bestTranslatedWordScore
      }
      
      if (_translatedWords.length > 1) {
        combinedScore = combinedScore / _translatedWords.length; // get average score of all words
      }

      if (combinedScore < translatedThreshold) {
        continue
      }
      
      let translatedScore = combinedScore
          
      const currentMatches: ScoredMatchElementType[] = []
      for (const match of originalMatches || []) {
        const originalMatchText = match?.text;
        const originalScore = fuzz.ratio(originalMatchText, quoteWord);
        if (originalScore > originalThreshold) {
          const combinedScore = originalScore * translatedScore / 100; // combine scores
          const bestOriginalMatch = {
            ...match,
            originalText:
            originalMatchText,
            quoteWord,
            translatedText: _translatedPhrase
          };
          const newMatch: ScoredMatchElementType = {
            score: combinedScore,
            bestOriginalMatch,
            bestTranslationMatch: bestTranslationMatches
          }
          currentMatches.push(newMatch);
        }
      }

      if (currentMatches.length) {
        const currentMatches_ = currentMatches.sort((a, b) => b.score - a.score);
        foundMatches.push(...currentMatches_.slice(0, 2 * matchCount));
      }
    }
  }

  const orderedList = foundMatches.sort((a, b) => b.score - a.score);

  // console.log(`changedCurrentCheck - orderedMatches`, orderedMatches, orderedList);

  for (const item of orderedList.slice(0, matchCount)) {
    const bestOriginalMatch = item?.bestOriginalMatch;
    const translatedText = bestOriginalMatch?.translatedText;
    const originalText = bestOriginalMatch?.originalText;
    const quoteWord = bestOriginalMatch?.quoteWord;
    const match = item?.bestOriginalMatch;
    const occurrences = match?.occurrences;
    //@ts-ignore
    const highLightedWords: HighlightedWordsType[] = item?.bestTranslationMatch?.map(m => {
      const matched = m?.matched;
      return {
        highlight: matched?.translatedWord,
        index: matched?.index,
      }
    }) || [];
    const score = item?.score;
    topMatches.push({
      sourceText: originalText || '',
      score,
      translatedText,
      highLightedWords,
      quoteWord,
      occurrences
    });
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
  const mapEntry:AlignmentElementType[] = alignmentMap_[origStr] as AlignmentElementType[];
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
 * Converts an array of objects containing translation matches into a CSV format string.
 *
 * @param {object[]} topMatches - An array of objects representing translation matches,
 * each containing keys such as "score", "translatedText", and "sourceText".
 * @return {string} A string containing the translation matches in CSV format.
 */
export function getTranslationCsv(topMatches: object[]) {
  // build translation tables as csv
  const headers = [
    { key: "score" },
    { key: "translatedText" },
    { key: "sourceText" },
  ];
  const translationCsv = objectToCsv(headers, topMatches);
  // console.log(`changedCurrentCheck - sortedTopMatches`, orderedTsv);
  return translationCsv;
}

/**
 * Generates an AI prompt by formatting translation matches into a CSV
 * and replacing placeholders in a template string.
 *
 * @param {object[]} topMatches - An array of match objects, where each object contains
 *                                information about the translation matches, including score,
 *                                translated text, and source text.
 *                                These are used to generate a CSV.
 * @param {string} verseText - The translated text to be embedded in the AI prompt.
 * @param {string} quoteStr - The source word or phrase to be included in the AI prompt.
 * @return {string} The constructed AI prompt with placeholders replaced by the provided parameters.
 */
export function buildAiPrompt(topMatches: object[], verseText:string, quoteStr: string, template = AIPromptTemplate1) {
  const translationCsv = getTranslationCsv(topMatches);

  // build AI prompt
  const prompt = template.replaceAll("{translationCsv}", translationCsv.join("\n"))
    .replaceAll("{translatedText}", verseText)
    .replaceAll("{sourceWord}", quoteStr);
  console.log(`changedCurrentCheck - prompt`, prompt);
  return prompt;
}

/**
 * Finds and returns the top translation matches for each word in a given quote based on an alignment map.
 * Uses scoring to identify the best matches and rescales scores to ensure consistency.
 *
 * @param {string} quoteStr - The input quote string, which may contain multiple words, to find top matches for.
 * @param {AlignmentMapType} alignmentMap_ - The alignment map used to match source text to target translations.
 * @param {string} translation
 * @return {ScoredTranslationType[]} An array of objects representing the top matches, each containing the source text,
 *                                   translated text, and a calculated score.
 */
export function getTopMatchesForQuote(quoteStr: string, alignmentMap_: AlignmentMapType, translation: string, matchCount: number = 10) {
  const topMatches: ScoredTranslationType[] = [];
  const quotes = quoteStr.split(" ");
  
  // transform map to key by translated word rather than original
  const translatedAlignmentMap: AlignmentMapType = {};
  const originalWords = alignmentMap_ && Object.keys(alignmentMap_);
  if (originalWords?.length) {
    for (const originalStr of originalWords) {
      const translatedMatches:AlignmentElementType[] = alignmentMap_[originalStr];
      for (const match of translatedMatches || []) {
        const translatedWord = match?.text;
        if (translatedWord) {
          const newTranslation = { ...match, text: originalStr};
          const currentMapping = translatedAlignmentMap[translatedWord];
          if (currentMapping) {
            currentMapping.push(newTranslation);
          } else {
            translatedAlignmentMap[translatedWord] = [newTranslation];
          }
        }
      }
    }
  }

  for (const quote of quotes) { // for each word get best translations
    const topMatches_: ScoredTranslationType[] = findBestMatches(quote, translatedAlignmentMap, matchCount, translation);
    const sortedTopMatches = sortByScore(topMatches_).slice(0, matchCount);
    const highScore = sortedTopMatches[0]?.score;
    // rescale so top match is a 1000
    // const factor = 100 / Math.round(highScore);
    for (const topMatch of sortedTopMatches) {
      // const score = Math.floor(topMatch.score)
      // const occurrences = topMatch.score - score;
      topMatch.score = Math.round(topMatch.score * 10000) / 10000;
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
      const topMatches = getTopMatchesForQuote(quoteStr, alignmentMap_, verseText);
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

/**
 * Parses a CSV string containing translations and their respective scores,
 * converts the score values into numerical format, and returns the parsed data.
 *
 * @param {string} csvLines - The input CSV string containing translation information and scores.
 * @return {Object} An array of objects representing the parsed translations and their numerical scores.
 */
export function getScoredTranslations(csvLines:string) {
  const { csvItems } = csvToObjects(csvLines) as { csvItems: any[] };
  if (csvItems) {
    // remove double quotes
    for (const csvItem of csvItems) {
      for (const key of Object.keys(csvItem)) {
        const value = csvItem[key]
        if (key === 'score' || key === 'rank') {
          csvItem[key] = parseFloat(value)
        } else if (typeof value === 'string') {
          csvItem[key] = normalizer(value)
        }
      }
    }
  }
  return csvItems as Object;
}

/**
 * Highlights the best phrases in a translated text by comparing scored phrases
 * with individual words in the translation and calculating their similarity score.
 *
 * @param {string} translatedText - The translated text where highlights will be identified.
 * @param {BestPhasesElementType[]} scoredPhrases - An array of objects representing scored phrases,
 * each containing a translation and rank.
 * @return {BestHighlightsElementType[]} - A sorted array of objects representing the scored and ranked
 * phrases, including the matches and their calculated scores.
 */
export function highlightBestPhraseInTranslation(translatedText: string, scoredPhrases: BestPhasesElementType[]) {
  const translatedWords = translatedText.split(" ").map(w => normalizer(w).trim());
  const dupeCheck: Record<string, number[]> = {};

  const highlights:BestHighlightsElementType[] = [];
  for (let tIndex = 0; tIndex < scoredPhrases.length; tIndex++) {
    const t = scoredPhrases[tIndex];
    const translatedTextSplit = (t.translation)?.split(" ") || [];
    const initialScore = 100 - t.rank;
    const bestMatches = []
    let match: MatchesType;
    for (let i = 0; i < translatedTextSplit.length; i++) {
      const highlightedWord = translatedTextSplit[i];
      let bestScore = 0;
      let bestIndex = -1;
      for (let index = 0; index < translatedWords.length; index++) {
        const translatedWord = translatedWords[index];

        // get best match between translated Word and highlight word
        const translatedFuzzScore = fuzz.ratio(highlightedWord, translatedWord);
        if (translatedFuzzScore > bestScore) {
          bestScore = translatedFuzzScore
          bestIndex = index
        }
      }

      match = { index: bestIndex, score: bestScore };
      bestMatches.push(match);
    }
    // get product of best scores
    const bestPhraseScore = bestMatches.reduce((a, b) => a * b.score / 100, 1);
    highlights.push ({highlights: t.translation, score: initialScore * bestPhraseScore, matches: bestMatches})
  }

  // sort scoredPhrases by score
  const highlights_ = highlights.sort((a, b) => (b.score || 0) - (a.score || 0));
  return highlights_;
}

/**
 * Highlights the best matching words between the source text and the translated text,
 * based on scored translations, and returns an array of the matched words with corresponding details.
 *
 * @param {string} sourceText - The original source text containing words to match.
 * @param {string} translatedText - The translated text containing words to compare against.
 * @param {scoredTranslationType} scoredTranslations - An array of scored translations for evaluating matching words.
 *
 * @return {Array<{translatedText: string, sourceText: string, index: number, score: number}>}
 * An array of highlighted words, including the translated word, corresponding source word, index, and match score.
 */
export function highlightBestWordsInTranslation(sourceText: string, translatedText: string, scoredTranslations: ScoredTranslationType[]) {
  const sourceWords = sourceText.split(" ").map(w => normalizer(w).trim());
  const translatedWords = translatedText.split(" ").map(w => normalizer(w).trim());
  let highlightedWords:{ translatedText: string, sourceText: string, index: number, score: number }[] = []
  const dupeCheck: Record<string, number[]> = {};

  for (let tIndex = 0; tIndex < scoredTranslations.length; tIndex++) {
    const t = scoredTranslations[tIndex];
    const translatedTextSplit = (t.translatedText)?.split(" ") || [];
    const initialScore = t.score;
    for (let index = 0; index < translatedWords.length; index++) {
      const translatedWord = translatedWords[index];
      for (let singleTranslatedWordIndex = 0; singleTranslatedWordIndex < translatedTextSplit.length; singleTranslatedWordIndex++) {
        const singleTranslatedWord = translatedTextSplit[singleTranslatedWordIndex];
        
        // get best match to translated Word
        const translatedFuzzScore = fuzz.ratio(singleTranslatedWord, translatedWord);
        if (!(translatedFuzzScore > 1)) {
          continue; // if no match, then skip
        }

        // get best match to sourceWord
        let highestSourceText = '';
        let highSourceFuzzScore = 0;
        const sourceTextToMatch = t.sourceText;
        for (let i = 0; i < sourceWords.length; i++) {
          const sourceWord = sourceWords[i];
          const sourceFuzzScore = fuzz.ratio(sourceTextToMatch, sourceWord);
          if (sourceFuzzScore > highSourceFuzzScore) {
            highestSourceText = sourceWord;
            highSourceFuzzScore = sourceFuzzScore;
          }
        }
        
        const combinedScore = (translatedFuzzScore / 100) * (highSourceFuzzScore / 100) * initialScore;
        if (!(highSourceFuzzScore > 1)) {
          continue; // if no match, then skip
        }
        
        let saveTranslated = !highlightedWords[index];
        if (!saveTranslated) { // if word already found, see if higher score
          const currentScore = highlightedWords[index].score;
          if (currentScore < combinedScore) { // if new score is a better match, replace it
            saveTranslated = true;
          }
        }
        if (saveTranslated) {
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
              translatedText: translatedWord,
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
    const sourceText = highlightedWords[i].sourceText;
    if (dupeCheck[sourceText]) {
      dupeCheck[sourceText].push(i);
    } else {
      dupeCheck[sourceText] = [i];
    }
  }

  // double check duplicated translated words
  for (const sourceText in dupeCheck) {
    const dupeList = dupeCheck[sourceText];

    if (dupeList.length > 1) {
      // now see if translated words are also duplicated
      for (let i = 0; i < dupeList.length; i++) {
        const index = dupeList[i];
        if (!highlightedWords[index]) { // if already removed, skip
          continue;
        }
        const firstTranslatedWord = highlightedWords[index].translatedText;
        let translatedDuplicateFound = [];
        for (let j = i + 1; j < dupeList.length; j++) {
          const secondIndex = dupeList[j];
          const secondTranslatedWord = highlightedWords[secondIndex].translatedText;
          if (firstTranslatedWord === secondTranslatedWord) {
            translatedDuplicateFound.push(secondIndex);
          }
        }

        if ((dupeList.length > 1) && (translatedDuplicateFound.length < 1)) {
          // if source duplicated, but translated is not, remove all but highest match
          let highIndex = -1
          let highScore = -1
          for (const dupeIndex of dupeList) {
            const currentScore = highlightedWords[dupeIndex]?.score
            if (currentScore > highScore) {
              highIndex = dupeIndex;
              highScore = currentScore;
            }
          }

          // delete worse matches
          for (const dupeIndex of dupeList) {
            if (dupeIndex !== highIndex){
              delete highlightedWords[dupeIndex];
            }
          }
          break;
        }
      }
    }
  }

  let highlightedWords_ = highlightedWords.filter(word => word);
  const averageScore = highlightedWords_.reduce((sum, word) => sum + word.score, 0) / highlightedWords.length;

  // Sort highlightWords by index in ascending order
  highlightedWords_ = highlightedWords_.sort((a, b) => a.index - b.index);

  if (averageScore < 80) {
    // limit to words above average score
    highlightedWords_ = highlightedWords_.filter(word => word.score > averageScore);
    console.log(`changedCurrentCheck - highlightWords_`, highlightedWords_);
  }

  const foundHighlightedWords = [];
  for (let i = 0; i < translatedWords.length; i++) {
    const translatedWord = translatedWords[i];
    const pos = highlightedWords_.findIndex(w => (w.translatedText === translatedWord))
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

export function getBestHighlights(sourceText: string, scoredTranslations: ScoredTranslationType[]) {
  const sourceWords = sourceText.split(" ").map(w => normalizer(w).trim());
  type HighlightMatchesType = { occurrences: number; matches: ScoredTranslationType[] };
  const highlightMap: Record<string, HighlightMatchesType> = {};

  
  // map scored translations to related quote words
  for (const t of scoredTranslations) {
    const key = t?.quoteWord
    let value = highlightMap[key]
    if (!value) {
      highlightMap[key] =  { occurrences: 0, matches: [t] }
    } else {
      value?.matches?.push(t);
    }
  }
  
  // get total occurrences for source word
  for (const key in highlightMap) {
    let occurrencesSum = 0
    for (const value of highlightMap[key]?.matches) {
      occurrencesSum += value?.occurrences || 0
    }
    highlightMap[key].occurrences = occurrencesSum
  }

  // update score based on frequncy of occurrence
  for (const key in highlightMap) {
    const totalOccurrences = highlightMap[key]?.occurrences
    for (const value of highlightMap[key]?.matches) {
      if (value) {
        const occurrences = value?.occurrences || 0;
        const score = value?.score || 0;
        // value.score = (score + (occurrences/totalOccurrences) * 100) / 2 // average
        value.score = score * (occurrences/totalOccurrences)
      }
    }
  }

  const sourceWordMap = []
  for (let i = 0; i < sourceWords.length; i++) {
    const word = sourceWords[i];
    const list = highlightMap[word];
    let found:string|null = null
    if (list) {
      found = word;
    }
    sourceWordMap[i] = found
  }

  const origWordPointers = new Array(sourceWords.length).fill(0);
  
  const combinations: object[] = []
  let index = -1
  while (combinations.length < 50) {
    // find next match for quote word
    const foundMatches:ScoredTranslationType[] = []
    for (let i = 0; i < origWordPointers.length; i++) {
      const pointer = origWordPointers[i]
      const sourceWord = sourceWords[i]
      if (sourceWord) {
        const matches = highlightMap[sourceWord]?.matches
        
        // check for duplicate highlights
        let keep = true
        for (let j = 0; j < i; j++) {
          const previousHighlightedWords = foundMatches[j]?.highLightedWords;
          const previousHighlight = previousHighlightedWords?.[0]?.index
          const currentHighlightedWords = matches[pointer]?.highLightedWords;
          const currentHighlight = currentHighlightedWords?.[0]?.index
          if (pointer < matches?.length) {
            keep = true
            if (previousHighlightedWords && currentHighlightedWords) {
              if (previousHighlight === currentHighlight && previousHighlightedWords.length === currentHighlightedWords.length) {
                const previousScore = foundMatches[j]?.score
                const currentScore = matches[pointer]?.score
                if (currentScore > previousScore) {
                  delete foundMatches[j];
                } else {
                  keep = false;
                }
              }
            }
          } else {
            keep = false;
          }
        }
        if (keep) {
          foundMatches[i] = matches[pointer]
        }
      }
    }
    
    // calculate average score
    let scoreSum = 0;
    for (const match of foundMatches) {
      if (match) {
        const score = match.score
        scoreSum += score
      }
    }
    scoreSum = scoreSum / sourceWords.length
    
    // save score for combination
    const wordMatches = { score: scoreSum, matches: foundMatches }
    combinations.push(wordMatches);
    
    // move to next word and move to next match
    index++;
    if (index >= origWordPointers.length) {
      index = 0;
    }
    origWordPointers[index]++;
  }

  const sortedCombinations = combinations.sort((a, b) => (b as any).score - (a as any).score);
  console.log(sortedCombinations);

  // return wordIndexes;
}
