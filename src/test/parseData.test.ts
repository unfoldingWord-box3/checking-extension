// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import * as assert from 'assert';
// @ts-ignore
import * as ospath from "ospath";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getParsedUSFM } from "../utilities/resourceUtils";
// @ts-ignore
import {
  addAlignmentsForBibleBook,
  addAlignmentsForCheckingData,
  AlignmentMapType,
  BestPhasesElementType,
  buildAiPrompt,
  cleanupVerse,
  getBestHighlights,
  getElapsedSeconds,
  getScoredTranslations,
  getTopMatchesForQuote,
  getTranslationCsv,
  highlightBestPhraseInTranslation,
  highlightBestWordsInTranslation,
  normalize,
  ScoredTranslationType,
// @ts-ignore
} from "../utilities/shared/translationUtils";
import { isNT } from "../utilities/BooksOfTheBible";

import { getTranslationsFromFolder } from "../utilities/translationFileUtils";
import { readJsonFile } from "../utilities/fileUtils";
import { autoDetectProjectFolder } from "./checkToTsv.test";
import { AIPromptTemplate2 } from "../utilities/shared/llmUtils";

const home = ospath.home();
const baseFolder = autoDetectProjectFolder();
const testFixtures = path.join(baseFolder, './src/test/fixtures')

suite('Parse Data', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('Parse Data tests done!');
  });

  test.skip('Process all NT usfms and extract alignments', () => {
    const projectFolder = path.join(testFixtures, './bn_glt/alignments')
    const alignmentMap_:AlignmentMapType = {};
    const files = fs.readdirSync(projectFolder);
    const doNT = true;
    for (const file of files) {
      if (file.endsWith(".usfm")) {
        const baseFileName = path.parse(file).name;

        const bookId = baseFileName.split('-')[1]?.toLowerCase();

        if (isNT(bookId) != doNT) {
          continue;
        }
        const usfm = fs.readFileSync(path.join(projectFolder, file), "UTF-8")?.toString() || '';
        const bookJson = getParsedUSFM(usfm);

        // assert.ok(bookJson);
        addAlignmentsForBibleBook(bookJson, bookId, alignmentMap_);
        assert.ok(Object.keys(alignmentMap_).length > 100);
        // console.log(`alignmentMap_ = ${JSON.stringify(alignmentMap_, null, 2)}`)
      }
    }
  });

  test.skip('Process previous twl checks', () => {
    const projectFolder = path.join(testFixtures, './bn_glt/checking/twl')
    const alignmentMap_:AlignmentMapType = {};
    const files = fs.readdirSync(projectFolder);
    const doNT = true;
    for (const file of files) {
      if (file.endsWith("_check")) {
        const baseFileName = path.parse(file).name;

        const bookId = baseFileName.split('.')[0]?.toLowerCase();

        if (isNT(bookId) != doNT) {
          continue;
        }
        const checkingData = fs.readJsonSync(path.join(projectFolder, file));
        
        assert.ok(Object.keys(checkingData)?.length === 3);
        addAlignmentsForCheckingData(checkingData, bookId, alignmentMap_);
        const alignmentCount = Object.keys(alignmentMap_).length;
        console.log(`alignmentCount = ${alignmentCount}`)
        assert.ok(alignmentCount > 1);
        // console.log(`alignmentMap_ = ${JSON.stringify(alignmentMap_, null, 2)}`)
      }
    }
  });

  test.skip('Process all NT usfms and checks and extract translations From Alignments', () => {
    const projectFolder = path.join(testFixtures, './bn_glt/alignments/bn_irv')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });

  test.skip('Process all NT usfms and checks and extract translations From checking data', () => {
    const projectFolder = path.join(testFixtures, './bn_glt/checking/twl')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });

  test.skip('Process all NT usfms and checks and extract translations From checking data', () => {
    const projectFolder = path.join(testFixtures, './bn_glt/checking/tn')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });

  test.skip('Recursively Process all NT usfms and checks and extract translations From Files', () => {
    // const projectFolder = path.join(testFixtures, './bn_glt/alignments')
    const projectFolder = "/Users/blm0/translationCore/otherProjects/bn_glt";
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
    const outputFolder = path.join(projectFolder, 'translations.json')
    fs.outputJsonSync(outputFolder, alignmentMap_, { spaces: 2});
  });

  test.skip('Recursively Process all OT usfms and checks and extract translations From Files', () => {
    const projectFolder = path.join(testFixtures, './bn_glt/alignments')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = false;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });
});

const tempFolder = path.join(baseFolder, './src/test/fixtures/testing_temp')
const projectFolder = path.join(baseFolder, './src/test/fixtures/bn_glt/alignments')
const responseFolder = path.join(baseFolder, './src/test/fixtures/responses');

// from tN abstract nouns - Eph 2:1 - ULT - in your trespasses and sins
const translation = `আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে`
const normalizedTranslation = "আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে"
const sourceText = `τοῖς παραπτώμασιν καὶ ταῖς ἁμαρτίαις ὑμῶν`
const rawOriginalVerse = `আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে, `;
const normalizedSource = "τοῖς παραπτώμασιν καὶ ταῖς ἁμαρτίαις ὑμῶν"
const expectedSelection = `তোমাদের অপরাধে ও পাপে`
const normalizedExpectedSelection = "তোমাদের অপরাধে ও পাপে"

export function extractCsvFromResponse(response : string) {
  const csvStartString = [
    '```csv\n',
    '```\n'
  ];
  
  let foundCsv = ''
  for (const startCode of csvStartString) { // try different possibilities for the csv start in md
    const index = response.toLowerCase().indexOf(startCode.toLowerCase());
    if (index >= 0) {
      const endIndex = response.indexOf("```", index + startCode.length);
      foundCsv = response.substring(index + startCode.length, endIndex);
      break;
    }
  }
  return foundCsv;
}

suite('AI', function () {
  this.timeout(10000); // set timeout for each test in suite
  
  suiteSetup(() => {
    fs.ensureDirSync(tempFolder)
  })

  suiteTeardown(() => {
    vscode.window.showInformationMessage('AI Response tests done!');
  });

  test("Generate AI Prompt", async function() {
    const start = Date.now();
    const translationsPath = path.join(projectFolder, "translations.json");
    const alignmentMap = readJsonFile(translationsPath) as AlignmentMapType;
    const quoteStr = normalize(sourceText);
    const translation_ = normalize(translation);
    const verseText = cleanupVerse(rawOriginalVerse);
    const topMatches = getTopMatchesForQuote(quoteStr, alignmentMap, translation_, 5);
    const prompt = await buildAiPrompt(topMatches, verseText, quoteStr, AIPromptTemplate2);
    const promptPath = path.join(tempFolder, "prompt.txt");
    const elapsed = getElapsedSeconds(start);
    console.log(`Generate AI Prompt took: ${elapsed} seconds`);
    fs.outputFileSync(promptPath, prompt, "UTF-8");
    console.log(prompt);
  });

    test('Parse top Translation Matches', () => {
      const start = Date.now();
      const translationsPath = path.join(projectFolder, 'translations.json');
      const alignmentMap = readJsonFile(translationsPath) as AlignmentMapType;
      const quoteStr = normalize(sourceText)
      const translation_ = normalize(translation)
      // const expectedSelection_ = normalize(expectedSelection)
      // assert.ok(quoteStr === sourceText);
      const verseText = cleanupVerse(rawOriginalVerse)
      const topMatches = getTopMatchesForQuote(quoteStr, alignmentMap, translation_);

      const highlightedWords = getBestHighlights(sourceText, topMatches);

      const elapsed = getElapsedSeconds(start);
      console.log(`Parse top Translation Matches took: ${elapsed} seconds`);
      
      console.log(highlightedWords);
      
      // // map to string
      // const highlightedText = highlightedWords?.map(word => word.translatedText).join(' ');
      // console.log(highlightedText);
      //
      // const expectedWords = normalizedExpectedSelection.split(' ').map(word => normalize(word));
      // for (let i = 0; i < expectedWords.length; i++) {
      //   const expectedWord = expectedWords[i]
      //   const highlightedWord = highlightedWords[i].translatedText
      //   assert.ok(expectedWord === highlightedWord);
      // }
      // assert.ok(highlightedText === normalize(normalizedExpectedSelection));
    });
    
    test('Parse AI Response from AIPromptTemplate1', () => {
      const start = Date.now();
      const responsePath = path.join(responseFolder, 'response1.txt');
      const response = fs.readFileSync(responsePath, "UTF-8")?.toString() || '';
      const foundCsv = extractCsvFromResponse(response);
      assert.ok(foundCsv);

      const scoredTranslations = getScoredTranslations(foundCsv) as ScoredTranslationType[];
      console.log(`quoteStr =\n`,JSON.stringify(scoredTranslations, null, 2));

      // Obtain best translations
      const highlightedWords = highlightBestWordsInTranslation(sourceText, translation, scoredTranslations);

      // map to string
      const highlightedText = highlightedWords.map(word => word.translatedText).join(' ');
      console.log(highlightedText);

      const elapsed = getElapsedSeconds(start);
      console.log(`Parse AI Response from AIPromptTemplate1 took: ${elapsed} seconds`);

      const expectedWords = normalizedExpectedSelection.split(' ').map(word => normalize(word));
      for (let i = 0; i < expectedWords.length; i++) {
        const expectedWord = expectedWords[i]
        const highlightedWord = highlightedWords[i].translatedText
        assert.ok(expectedWord === highlightedWord);
      }
      assert.ok(highlightedText === normalize(normalizedExpectedSelection));
  });

  test('Parse AI Response from AIPromptTemplate2', () => {
    const start = Date.now();
    const responsePath = path.join(responseFolder, 'response2.txt');
    const response = fs.readFileSync(responsePath, "UTF-8")?.toString() || '';
    const foundCsv = extractCsvFromResponse(response);
    
    const scoredPhrases = getScoredTranslations(foundCsv) as BestPhasesElementType[];
    console.log(`quoteStr =\n`,JSON.stringify(scoredPhrases, null, 2));

    const highlightedText = highlightBestPhraseInTranslation(translation, scoredPhrases)
    console.log(highlightedText);
    
    const elapsed = getElapsedSeconds(start);
    console.log(`Parse AI Response from AIPromptTemplate2 took: ${elapsed} seconds`);
  });
})

