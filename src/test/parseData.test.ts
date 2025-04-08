// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getParsedUSFM } from "../utilities/resourceUtils";
// @ts-ignore
import {
  addAlignmentsForBibleBook,
  addTranslationToMap,
  AlignmentMapType,
  getQuoteStr,
} from "../utilities/shared/translationUtils";
import { isNT } from "../utilities/BooksOfTheBible";
import { tsvToObjects } from "../utilities/shared/tsvUtils";
// @ts-ignore
import { groupDataHelpers } from 'word-aligner-lib';

suite('Parse Data', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('Parse Data tests done!');
  });

  test('Process all NT usfms and extract alignments', () => {
    const projectFolder = '/Users/blm0/translationCore/otherProjects/bn_glt_en_eph/alignments/bn_irv'
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

        assert.ok(bookJson);
        addAlignmentsForBibleBook(bookJson, bookId, alignmentMap_);
        assert.ok(Object.keys(alignmentMap_).length > 100);
        // console.log(`alignmentMap_ = ${JSON.stringify(alignmentMap_, null, 2)}`)
      }
    }
  });

  test('Process previous twl checks', () => {
    const projectFolder = '/Users/blm0/translationCore/otherProjects/bn_glt_en_eph/checking/twl'
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

        const groupsData = groupDataHelpers.extractGroupData(checkingData)
        const flattenedGroupsData = groupDataHelpers.flattenGroupData(groupsData)
        for (const groupId of Object.keys(flattenedGroupsData)) {
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
        assert.ok(Object.keys(alignmentMap_).length > 1);
        // console.log(`alignmentMap_ = ${JSON.stringify(alignmentMap_, null, 2)}`)
      }
    }
  });
});
