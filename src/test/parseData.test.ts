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
  getBestTranslations,
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
    fs.outputJsonSync(outputFolder, alignmentMap_);
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
আর,καὶ,189.2
তোমরা,ὑμῶν,107.6
তোমাদের,ὑμῶন,142.3
অপরাধে,παραπτώμασιν,100.1
ও,καὶ,249.7
পাপে,ἁμαρτίαις,100.3
\`\`\`
`;

const csvStartCodes = [
  '```csv\n',
  '```\n'
];

const projectFolder = path.join(home, './translationCore/otherProjects/bn_glt_en_eph/alignments')
const translation = `আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে`
const sourceText = `τοῖς παραπτώμασιν καὶ ταῖς ἁμαρτίαις ὑμῶν`
const expectedSelection = `তোমাদের অপরাধে ও পাপে`

suite('AI', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('AI Response tests done!');
  });

    test('Generate AI Prompt', () => {
      const translationsPath = path.join(projectFolder, 'translations.json');
      const alignmentMap = readJsonFile(translationsPath) as AlignmentMapType;
      const quoteStr = normalize(`τοῖς παραπτώμασιν καὶ ταῖς ἁμαρτίαις ὑμῶν`)
      const verseText = cleanupVerse(`আর তোমরা তোমাদের অপরাধে ও পাপে মৃত ছিলে, `)
      const topMatches = getTopMatchesForQuote(quoteStr, alignmentMap);
      const prompt = buildAiPrompt(topMatches, verseText, quoteStr)
      const promptPath = path.join(projectFolder, 'prompt.txt')
      fs.outputFileSync(promptPath, prompt, "UTF-8");
      console.log(prompt)
    })

    test('Parse AI Response', () => {
      for (const startCode of csvStartCodes) {
        const index = response.indexOf(startCode);
        if (index >= 0) {
          const endIndex = response.indexOf('```', index + startCode.length);
          const csv = response.substring(index + startCode.length, endIndex);
          const scoredTranslations:scoredTranslationType = getScoredTranslations(csv);
          console.log(`quoteStr =\n`,JSON.stringify(scoredTranslations, null, 2));
  
          // Obtain best translations
          const matchedTranslations = getBestTranslations(sourceText, translation, scoredTranslations);
  
          console.log(JSON.stringify(matchedTranslations, null, 2));
        }
      }
  });
})

