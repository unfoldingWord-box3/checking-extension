import * as fuzz from "fuzzball";
// @ts-ignore
import { AlignmentHelpers } from 'word-aligner-lib';
import { AIPromptTemplate, sortByScore } from "./llmUtils";
import { objectToCsv } from "./tsvUtils";

export function addOriginalAlignment(origLang: any[], alignment: any, targetLang: any[]) {
  origLang.push(alignment.content);
  for (const child of alignment.children || []) {
    const tag = child.tag;
    if (tag === "w") {
      targetLang.push(child.text);
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
 * @param {object|null} alignmentMap_ - An object mapping source strings to their respective matches and occurrences.
 * @param {number} matchCount - The maximum number of best matches to return.
 *
 * @return {object[]} - A list of top matches containing the source text, target text, and calculated score.
 */
export function findBestMatches(quoteStr: string, alignmentMap_: object | null, matchCount: number) {
  const orderedMatches:any = {}
  const topMatches:object[] = []

  const originalWords = alignmentMap_ && Object.keys(alignmentMap_);
  if (originalWords?.length) {
    for (const originalStr of originalWords) {
      const score = fuzz.ratio(originalStr, quoteStr);
      console.log(`changedCurrentCheck - originalStr ${originalStr}, score ${score}`);
      if (score) {
        // @ts-ignore
        orderedMatches[originalStr] = { score, match: alignmentMap_[originalStr] };
      }
    }
    const orderedList = Object.entries(orderedMatches)
      // @ts-ignore
      .sort(([, a], [, b]) => b.score - a.score)
      // @ts-ignore
      .map(([key, value]) => ({ original: key, ...value }));

    console.log(`changedCurrentCheck - orderedMatches`, orderedMatches, orderedList);

    for (const item of orderedList.slice(0, matchCount)) {
      const targetMatches = item?.match;
      const sourceText = item?.original;
      for (const match of targetMatches) {
        const targetStr = match?.text;
        const occurrences = match?.occurrences;
        const score = item?.score + occurrences / 10;
        topMatches.push({ sourceText: sourceText, score, targetText: targetStr });
      }
    }
  }
  return topMatches.slice(0, matchCount);
}

/**
 * Processes the target book and adds alignment mappings for a specific Bible book.
 *
 * @param {object} targetBook - The object representing the target book containing chapters and verses.
 * @param {string} bookId - The identifier of the Bible book being processed.
 * @param {Record<string, any>} alignmentMap_ - A map where original language strings are aligned to target language strings, with metadata such as occurrences and references.
 * @return {void} Does not return a value.
 */
export function addAlignmentsForBibleBook(targetBook: object, bookId:string, alignmentMap_: Record<string, any>) {
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
          const origStr = origLang.join(" ").toLowerCase();
          const targetStr = targetLang.join(" ").toLowerCase();
          const mapEntry = alignmentMap_[origStr];
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
      }
    }
  }
}

export function findAlignmentSuggestions(newContextId:object, alignmentMap_:object|null) {
  if (newContextId) {
    const orderedMatches:any = {}
    // @ts-ignore
    let quoteStr = (newContextId.quoteStr || newContextId.quote)?.toLowerCase();
    if (Array.isArray(quoteStr)) {
      quoteStr = quoteStr.join(" ");
    }

    if (quoteStr) {
      const topMatches: object[] = []
      const quotes = quoteStr.split(" ");
      const matchCount = (quotes.length > 1) ? 10 : 15

      for (const quote of quotes) { // for each word get best translations
        const topMatches_: object[] = findBestMatches(quote, alignmentMap_, matchCount);
        const sortedTopMatches = sortByScore(topMatches_.slice(0, matchCount));
        topMatches.push(...sortedTopMatches);
      }

      // build translation tables as csv
      const headers = [
        { key: 'score' },
        { key: 'targetText' },
        { key: 'sourceText' },
      ]
      const orderedTsv = objectToCsv(headers, topMatches)
      console.log(`changedCurrentCheck - sortedTopMatches`, orderedTsv);

      // build AI prompt
      // @ts-ignore
      const verseText = UsfmFileConversionHelpers.getVerseTextFromBible(targetBible, newContextId?.reference)
      const prompt = AIPromptTemplate.replaceAll('{translationCsv}', orderedTsv.join('\n'))
        .replaceAll('{translatedText}', verseText)
        .replaceAll('{sourceWord}', quoteStr)
      console.log(`changedCurrentCheck - prompt`, prompt);
    }
  }
}
