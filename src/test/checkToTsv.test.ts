import { checkDataToTn, checkDataToTwl, flattenGroupData } from "../utilities/checkerFileUtils";
// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';

suite('Test twl_check to twl tsv', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('All tests done!');
  });

  test('Test Titus', () => {
    const checkData = fs.readJsonSync('./src/test/fixtures/tit.twl_check');
    assert.ok(checkData)
    // expect(checkData).to.be.true;
    // const files = fs.readdirSync('./src/test')
    // console.log('files', files)
    // const files2 = fs.readdirSync('./src/test/fixtures')
    // console.log('files2', files2)
    
    const groupData = flattenGroupData(checkData)
    fs.outputJsonSync('./testResults_twl.json', groupData, { spaces: 2 })
    assert.ok(Object.keys(groupData).length > 5);

    const results = checkDataToTwl(groupData)
    assert.ok(results);
    fs.outputFileSync('./testResults_twl.tsv', results, 'UTF-8');
  });
});

suite('Test tn_check to tn tsv', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('All tests done!');
  });

  test('Test Titus', () => {
    const checkData = fs.readJsonSync('./src/test/fixtures/tit.tn_check');
    assert.ok(checkData)
    // expect(checkData).to.be.true;
    // const files = fs.readdirSync('./src/test')
    // console.log('files', files)
    // const files2 = fs.readdirSync('./src/test/fixtures')
    // console.log('files2', files2)

    const groupData = flattenGroupData(checkData)
    fs.outputJsonSync('./testResults_tn.json', groupData, { spaces: 2 })
    assert.ok(Object.keys(groupData).length > 5);

    const results = checkDataToTn(groupData)
    assert.ok(results);
    fs.outputFileSync('./testResults_tn.tsv', results, 'UTF-8');
  });
});