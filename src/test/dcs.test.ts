// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';
import * as path from 'path';
// @ts-ignore
import * as ospath from "ospath";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getChecksum } from "../utilities/fileUtils";
import {
  createRepoBranch,
  createCheckingRepository,
  getRepoName,
  getRepoTree,
  createRepoFromFile,
} from "../utilities/network";
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
const envPath = path.join(projectFolder, '.env.json')
const env = { TOKEN: 'null', USER: 'null' } // require(envPath)

suite('Tests', () => {
  test('Test CRC', async () => {
    const filePath = path.join(projectFolder, './src/test/fixtures/tit.tn_check');
    assert.ok(fs.existsSync(filePath))
    const checksum = await getChecksum(filePath)
    assert.equal(checksum, 'b28d94cdc04a30619fb81aabd3500eaf885824b835ecd1e061f11e69fe336225')
  });
});

const server = 'https://git.door43.org'
const token = env.TOKEN;
const owner = env.USER;
const targetLanguageId = 'pigeon';
const targetBibleId = 'ult';
const glLanguageId = 'en';
const bookId = 'tit';
const repo = getRepoName(targetLanguageId, targetBibleId, glLanguageId, bookId);

suite.skip('Repo Tests', async ()=> {
  test('Test getRepoName', () => {
    const repoName = getRepoName(targetLanguageId, targetBibleId, glLanguageId, bookId)
    assert.equal(repoName, "pigeon_ult_en_tit_checking")
  })
  
  test('Test getRepoTree', async () => {
    const sha = 'master'; // or a specific commit SHA
    const results = await getRepoTree(server, owner, repo, sha, token)
    assert.ok(!results.error)
    assert.ok(results.tree?.length)
    console.warn(results)
  })

  test('Test createRepoBranch', async () => {
    const newBranch = 'update_current';
    const branch = await createRepoBranch(server, owner, repo, newBranch, token)
    assert.ok(!branch.error)
    assert.equal(branch.name, newBranch)
  })

  test('Test createRepoFile', async () => {
    const branch = 'update_current';
    const filePath = path.join(projectFolder, './src/test/fixtures/tit.tn_check');
    
    const branchFilePath = 'fixtures/tit.tn_check';
    const results = await createRepoFromFile(server, owner, repo, branch, branchFilePath, filePath, token)
    assert.ok(!results.error)
    assert.ok(results.content.html_url)
    assert.equal(results.content.name, branchFilePath)
 
  })

  test.skip('Test createRepository', async () => {
    const results = await createCheckingRepository(server, owner, repo, token)
    assert.ok(!results.error)
    assert.equal(results.name, repo)
  })
})

