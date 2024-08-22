import { flattenGroupData } from "../utilities/checkerFileUtils";
// @ts-ignore
import * as fs from "fs-extra";
// @ts-ignore
const chai = import("chai");
// @ts-ignore
const expect = chai.expect;

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';

suite('Test check_twl to twl tsv', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('All tests done!');
  });

  test('Test Titus', () => {
    const checkData = fs.readJsonSync('./fixtures/tit.twl_check');
    expect(checkData).to.be.true;
    const groupData = flattenGroupData(checkData)
    expect(groupData).to.be.true;
  });
});