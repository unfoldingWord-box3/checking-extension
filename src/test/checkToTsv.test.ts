import {
  checkDataToTn,
  checkDataToTwl,
  flattenGroupData,
  importSelectionsDataIntoCheckData,
  tsvToObjects,
} from "../utilities/checkerFileUtils";
// @ts-ignore
import * as fs from "fs-extra";
import * as assert from "assert";
import * as path from "path";
// @ts-ignore
import * as ospath from "ospath";
// @ts-ignore
import cloneDeep from "lodash.clonedeep";
// @ts-ignore
import isEqual from "deep-equal";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
// import * as myExtension from '../extension';

const TEST_FILE = './src/test/fixtures/tit.twl_check';

function autoDetectProjectFolder() {
  const home = ospath.home();
  let projectFolder = path.join(__dirname, '../..');
  if (!fs.existsSync(path.join(projectFolder, TEST_FILE))) { // check relative to test folder
    projectFolder = path.join(__dirname, '..');
    if (!fs.existsSync(path.join(projectFolder, TEST_FILE))) { // check relative to parent folder
      projectFolder = home;
      if (!fs.existsSync(path.join(projectFolder, TEST_FILE))) { // check relative to home folder
        projectFolder = '.'; // try to use current
      }
    }
  }
  return projectFolder;
}

const projectFolder = autoDetectProjectFolder();

// to run unit tests in debugger set path to project relative to home
// const projectFolder = path.join(home, 'Development/VsCode/checking-extension')
// to run unit tests regularly, just use `.`

const files = fs.readdirSync(projectFolder);
console.log(files);

suite('Test twl_check to twl selections tsv', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('All Test twl_check to twl selections tsv!');
  });

  test('Test Titus', () => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.twl_check'));
    assert.ok(checkData);
    
    const groupData = flattenGroupData(checkData);
    fs.outputJsonSync(path.join(projectFolder, './testResults_twl.json'), groupData, { spaces: 2 });
    assert.ok(Object.keys(groupData).length > 5);

    const results = checkDataToTwl(groupData);
    assert.ok(results);
    fs.outputFileSync(path.join(projectFolder, './testResults_twl.tsv'), results, 'UTF-8');
  });
});

suite('Test import twl selections tsv to twl_check', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('Test twl selections tsv to twl_check!');
  });

  test('Test Titus import identical selections should not change', async() => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.twl_check'));
    assert.ok(checkData);
    const originalCheckData = cloneDeep(checkData)

    const selectionData = fs.readFileSync(path.join(projectFolder, './testResults_twl.tsv'), "UTF-8")?.toString() || '';
    assert.ok(selectionData);

    const { tsvItems } = tsvToObjects(selectionData);
    assert.ok(tsvItems.length);

    const {
      updatedCount,
      errors,
      importedLines
    } = importSelectionsDataIntoCheckData(tsvItems, checkData);
    const sameData = isEqual(checkData, originalCheckData);
    assert.ok(sameData)
    assert.equal(updatedCount, 3)
    assert.equal(errors?.length, 0)
    assert.equal(importedLines, 188)
  });

  test('Test Titus import change one selection', async() => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.twl_check'));
    assert.ok(checkData);
    const originalCheckData = cloneDeep(checkData)

    const selectionData = fs.readFileSync(path.join(projectFolder, './testResults_twl.tsv'), "UTF-8")?.toString() || '';
    assert.ok(selectionData);

    const { tsvItems } = tsvToObjects(selectionData);
    assert.ok(tsvItems.length);
    const modifiedTsvItem = tsvItems[1];
    const newSelection = 'Christ';
    modifiedTsvItem.selections = JSON.stringify(newSelection);

    const {
      updatedCount,
      errors,
      importedLines
    } = importSelectionsDataIntoCheckData(tsvItems, checkData);
    const sameData = isEqual(checkData, originalCheckData);
    assert.ok(!sameData)
    assert.equal(updatedCount, 4)
    assert.equal(errors?.length, 0)
    assert.equal(importedLines, 188)
    const changedItem = checkData['kt'].groups['christ'][0]
    assert.equal(changedItem.selections, newSelection)
  });

  test('Test Titus import unmatched item', async() => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.twl_check'));
    assert.ok(checkData);
    const originalCheckData = cloneDeep(checkData)

    const selectionData = fs.readFileSync(path.join(projectFolder, './testResults_twl.tsv'), "UTF-8")?.toString() || '';
    assert.ok(selectionData);

    const { tsvItems } = tsvToObjects(selectionData);
    assert.ok(tsvItems.length);
    const modifiedTsvItem = tsvItems[1];
    modifiedTsvItem.selections = JSON.stringify('Christ')
    modifiedTsvItem.ID = 'abcd'

    const {
      updatedCount,
      errors,
      importedLines
    } = importSelectionsDataIntoCheckData(tsvItems, checkData);
    const sameData = isEqual(checkData, originalCheckData);
    assert.ok(sameData)
    assert.equal(updatedCount, 3)
    assert.equal(errors?.length, 1)
    assert.equal(importedLines, 188)
  });
});

suite('Test tn_check to tn selections tsv', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('All Test tn_check to tn selections tsv!');
  });

  test('Test Titus', () => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.tn_check'));
    assert.ok(checkData);

    const groupData = flattenGroupData(checkData)
    fs.outputJsonSync(path.join(projectFolder, './testResults_tn.json'), groupData, { spaces: 2 });
    assert.ok(Object.keys(groupData).length > 5);

    const results = checkDataToTn(groupData);
    assert.ok(results);
    fs.outputFileSync(path.join(projectFolder, './testResults_tn.tsv'), results, 'UTF-8');
  });
  
  test('Test Titus import identical selections should not change', async() => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.tn_check'));
    assert.ok(checkData);
    const originalCheckData = cloneDeep(checkData)

    const selectionData = fs.readFileSync(path.join(projectFolder, './testResults_tn.tsv'), "UTF-8")?.toString() || '';
    assert.ok(selectionData);

    const { tsvItems } = tsvToObjects(selectionData);
    assert.ok(tsvItems.length);

    const {
      updatedCount,
      errors,
      importedLines
    } = importSelectionsDataIntoCheckData(tsvItems, checkData);
    const sameData = isEqual(checkData, originalCheckData);
    assert.ok(sameData)
    assert.equal(updatedCount, 0)
    assert.equal(errors?.length, 0)
    assert.equal(importedLines, 156)
  });

  test('Test Titus import change one selection', async() => {
    const checkData = fs.readJsonSync(path.join(projectFolder, './src/test/fixtures/tit.tn_check'));
    assert.ok(checkData);
    const originalCheckData = cloneDeep(checkData)

    const selectionData = fs.readFileSync(path.join(projectFolder, './testResults_tn.tsv'), "UTF-8")?.toString() || '';
    assert.ok(selectionData);

    const { tsvItems } = tsvToObjects(selectionData);
    assert.ok(tsvItems.length);
    const modifiedTsvItem = tsvItems[1];
    const newSelection = 'Faith';
    modifiedTsvItem.selections = JSON.stringify(newSelection);

    const {
      updatedCount,
      errors,
      importedLines
    } = importSelectionsDataIntoCheckData(tsvItems, checkData);
    const sameData = isEqual(checkData, originalCheckData);
    assert.ok(!sameData)
    assert.equal(updatedCount, 1)
    assert.equal(errors?.length, 0)
    assert.equal(importedLines, 156)
    const changedItem = checkData['grammar'].groups['figs-abstractnouns'][0]
    assert.equal(changedItem.selections, newSelection)
  });
  
});