// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getParsedUSFM } from "../utilities/resourceUtils";
// @ts-ignore
import { addAlignmentsForBibleBook } from "../utilities/shared/translations";
import { isNT } from "../utilities/BooksOfTheBible";
// import * as myExtension from '../extension';

suite('Parse Data', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('Parse Data tests done!');
  });

  test('Process all NT usfms and extract alignments', () => {
    const projectFolder = '/Users/blm0/translationCore/otherProjects/bn_glt_en_eph/alignments/bn_irv'
    const alignmentMap_:Record<string, any> = {};
    const files = fs.readdirSync(projectFolder);
    const doNT = true;
    for (const file of files) {
      if (!file.endsWith(".usfm")) {
        continue;
      }
      const baseFileName = path.parse(file).name;

      const bookId = baseFileName.split('-')[1]?.toLowerCase();

      if (isNT(bookId) != doNT) {
        continue;
      }
      const usfm = fs.readFileSync(path.join(projectFolder, file), "UTF-8")?.toString() || '';
      const bookJson = getParsedUSFM(usfm);

      assert.ok(bookJson);
      addAlignmentsForBibleBook(bookJson, bookId, alignmentMap_);
      console.log(`alignmentMap_ = ${JSON.stringify(alignmentMap_, null, 2)}`)
    }
  });
});
