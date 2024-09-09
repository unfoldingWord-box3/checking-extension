// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';

suite('Check Versions', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('Version tests done!');
  });

  test('Extension package version should equal webview-UI package version', () => {
    const extensionManifest = fs.readJsonSync('./package.json');
    const webviewUiManifest = fs.readJsonSync('./webview-ui/package.json');

    const extensionVersion = extensionManifest?.version;
    assert.ok(extensionVersion)
    const webviewUinVersion = webviewUiManifest?.version;
    assert.ok(webviewUinVersion)
    assert.equal(extensionVersion, webviewUinVersion)
  });
});
