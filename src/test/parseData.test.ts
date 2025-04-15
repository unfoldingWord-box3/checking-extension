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
  buildAiPrompt,
  cleanupVerse,
  highlightBestWordsInTranslation,
  getScoredTranslations,
  getTopMatchesForQuote,
  normalize,
  scoredTranslationType,
} from "../utilities/shared/translationUtils";
import { isNT } from "../utilities/BooksOfTheBible";
import { csvToObjects } from "../utilities/shared/tsvUtils";

import { getTranslationsFromFolder } from "../utilities/translationFileUtils";
import { readJsonFile } from "../utilities/fileUtils";

const home = ospath.home();

suite('Parse Data', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('Parse Data tests done!');
  });

  test.skip('Process all NT usfms and extract alignments', () => {
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/alignments/bn_irv')
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
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/checking/twl')
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
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/alignments/bn_irv')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });

  test.skip('Process all NT usfms and checks and extract translations From checking data', () => {
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/checking/twl')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });

  test.skip('Process all NT usfms and checks and extract translations From checking data', () => {
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/checking/tn')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = true;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });

  test('Recursively Process all NT usfms and checks and extract translations From Files', () => {
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/alignments')
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
    const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/alignments')
    const alignmentMap_:AlignmentMapType = {};
    const doNT = false;
    getTranslationsFromFolder(projectFolder, doNT, alignmentMap_);
    const alignmentCount = Object.keys(alignmentMap_).length;
    console.log(`alignmentCount = ${alignmentCount}`)
    assert.ok(alignmentCount > 1);
  });
});

const response = `\`\`\`csv
translatedText,sourceText,score
আর,καὶ,100.168
তোমরা,ὑμῶν,99.017
তোমাদের,ὑμῶন,99.76
অপরাধে,παραπτώμασιν,99.677
ও,καὶ,100.282
পাপে,ἁμαρτίαις,100.333
\`\`\``;

const csvStartString = [
  '```csv\n',
  '```\n'
];

// from tN abstract nouns - Eph 2:1 - ULT - in your trespasses and sins
const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/alignments')
const translation = `আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে`
const normalizedTranslation = "আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে"
const sourceText = `τοῖς παραπτώμασιν καὶ ταῖς ἁμαρτίαις ὑμῶν`
const normalizedSource = "τοῖς παραπτώμασιν καὶ ταῖς ἁμαρτίαις ὑμῶν"
const expectedSelection = `তোমাদের অপরাধে ও পাপে`
const normalizedExpectedSelection = "তোমাদের অপরাধে ও পাপে"

suite('AI', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('AI Response tests done!');
  });

    test('Generate AI Prompt', () => {
      const translationsPath = path.join(projectFolder, 'translations.json');
      const alignmentMap = readJsonFile(translationsPath) as AlignmentMapType;
      const quoteStr = normalize(sourceText)
      const translation_ = normalize(translation)
      const expectedSelection_ = normalize(expectedSelection)
      // assert.ok(quoteStr === sourceText);
      const verseText = cleanupVerse(`আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে, `)
      const topMatches = getTopMatchesForQuote(quoteStr, alignmentMap, translation_);
      const prompt = buildAiPrompt(topMatches, verseText, quoteStr)
      const promptPath = path.join(projectFolder, 'prompt.txt')
      fs.outputFileSync(promptPath, prompt, "UTF-8");
      console.log(prompt)
    })

    test.skip('Parse AI Response', () => {
      for (const startCode of csvStartString) { // try different possibilities for the csv start in md
        const index = response.indexOf(startCode);
        if (index >= 0) {
          const endIndex = response.indexOf('```', index + startCode.length);
          const csv = response.substring(index + startCode.length, endIndex);
          const scoredTranslations:scoredTranslationType = getScoredTranslations(csv);
          console.log(`quoteStr =\n`,JSON.stringify(scoredTranslations, null, 2));
  
          // Obtain best translations
          const highlightedWords = highlightBestWordsInTranslation(sourceText, translation, scoredTranslations);
  
          // map to ordered string
          const highlightedText = highlightedWords.map(word => word.targetText).join(' ');
          console.log(highlightedText);

          const expectedWords = normalizedExpectedSelection.split(' ').map(word => normalize(word));
          for (let i = 0; i < expectedWords.length; i++) {
            const expectedWord = expectedWords[i]
            const highlightedWord = highlightedWords[i].targetText
            assert.ok(expectedWord === highlightedWord);
          }
          assert.ok(highlightedText === normalize(normalizedExpectedSelection));
        }
      }
      assert.ok(false); // csv not found
  });
})

