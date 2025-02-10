// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { fixUrls } from "../utilities/fileUtils";
// import * as myExtension from '../extension';

suite('fixUrls', () => {
  const preContent = '@media print{*,:after,:before{color:#000!important;text-shadow:none!important;background:0 0!important;-webkit-box-shadow:none!important;box-shadow:none!important}a,a:visited{text-decoration:underline}a[href]:after{content:" (" attr(href) ")"}abbr[title]:after{content:" (" attr(title) ")"}a[href^="javascript:"]:after,a[href^="#"]:after{content:""}blockquote,pre{border:1px solid #999;page-break-inside:avoid}thead{display:table-header-group}img,tr{page-break-inside:avoid}img{max-width:100%!important}h2,h3,p{orphans:3;widows:3}h2,h3{page-break-after:avoid}.navbar{display:none}.btn>.caret,.dropup>.btn>.caret{border-top-color:#000!important}.label{border:1px solid #000}.table{border-collapse:collapse!important}.table td,.table th{background-color:#fff!important}.table-bordered td,.table-bordered th{border:1px solid #ddd!important}}\n' +
    '@font-face{font-family:\'Glyphicons Halflings\';src:url('
  const postContent = ');src'
  const runTimeFolder = '/users/temp/'

  test('fix absolute paths', () => {
    // given
    const initialPath = '/assets/glyphicons-halflings-regular.eot';
    const initialCss = preContent + initialPath + postContent;
    const expectedFinalCss = preContent + path.join(runTimeFolder, initialPath) + postContent;
    const expectedConverts = 1
    
    // when
    const { changes, newCss } = fixUrls(initialCss, runTimeFolder);

    // then
    assert.equal(changes, expectedConverts)
    assert.equal(newCss, expectedFinalCss)
  });

  test('fix wrong paths', () => {
    // given
    const pathFromWebPack = '/assets/glyphicons-halflings-regular.eot';
    const initialPath = path.join('/users/temp2/stuff/', pathFromWebPack);
    const initialCss = preContent + initialPath + postContent;
    const expectedFinalCss = preContent + path.join(runTimeFolder, pathFromWebPack) + postContent;
    const expectedConverts = 1

    // when
    const { changes, newCss } = fixUrls(initialCss, runTimeFolder);

    // then
    assert.equal(changes, expectedConverts)
    assert.equal(newCss, expectedFinalCss)
  });

  test('do not change correct paths', () => {
    // given
    const pathFromWebPack = '/assets/glyphicons-halflings-regular.eot';
    const initialPath = path.join(runTimeFolder, pathFromWebPack);
    const initialCss = preContent + initialPath + postContent;
    const expectedFinalCss = preContent + path.join(runTimeFolder, pathFromWebPack) + postContent;
    const expectedConverts = 0

    // when
    const { changes, newCss } = fixUrls(initialCss, runTimeFolder);

    // then
    assert.equal(changes, expectedConverts)
    assert.equal(newCss, expectedFinalCss)
  });

  test('do not change non-assets paths', () => {
    // given
    const pathFromWebPack = '/stuff/glyphicons-halflings-regular.eot';
    const initialPath = pathFromWebPack;
    const initialCss = preContent + initialPath + postContent;
    const expectedFinalCss = preContent + path.join(runTimeFolder, pathFromWebPack) + postContent;
    const expectedConverts = 0

    // when
    const { changes, newCss } = fixUrls(initialCss, runTimeFolder);

    // then
    assert.equal(changes, expectedConverts)
    assert.equal(newCss, expectedFinalCss)
  });
});
