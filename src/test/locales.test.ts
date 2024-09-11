// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';

suite('Init Locales', () => {
  test('Compile Locale Jsons Into ts file', () => {
    const locales = { }
    const localePath = path.join('./src/data/locales');
    const files = fs.readdirSync(localePath);
    for (const file of files) {
      const parsed = path.parse(file);
      if (parsed.ext === '.json') {
        const LocaleFilePath = path.join(localePath, file);
        const localeData = fs.readJsonSync(LocaleFilePath)
        const key = parsed.name
        const value = localeData
        // @ts-ignore
        locales[key] = value
      }
    }
    const output = 'const locales_ =\n'
    + JSON.stringify(locales, null,2)
    + '\n\nexport const locales = locales_\n';
    fs.outputFileSync(path.join(localePath, 'locales.ts'), output, 'UTF-8');
    assert.ok(files.length)
  });
});
