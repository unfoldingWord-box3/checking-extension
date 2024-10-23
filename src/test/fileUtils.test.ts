// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getChecksum } from "../utilities/fileUtils";
// import * as myExtension from '../extension';

suite('Tests', () => {
  test('Test CRC', async () => {
    const filePath = path.join('./src/test/fixtures/tit.tn_check');
    const checksum = await getChecksum(filePath)
    assert.equal(checksum, 'b28d94cdc04a30619fb81aabd3500eaf885824b835ecd1e061f11e69fe336225')
  });
});
