// ############################
// for development of DCS
// ############################

// @ts-ignore
import * as fs from "fs-extra";
import * as assert from 'assert';
import * as path from 'path';
// @ts-ignore
import * as ospath from "ospath";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {
  getAllFiles,
  getChecksum,
  readJsonFile
} from "../utilities/fileUtils";
import {
  createRepoBranch,
  createCheckingRepository,
  downloadPublicRepoFromBranch,
  getRepoName,
  getRepoTree,
  uploadRepoFileFromPath,
  updateContentOnDCS,
  uploadRepoToDCS,
  getChangedFiles, getOwners, getReposForOwner, getCheckingReposForOwner,
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
const env = readJsonFile(envPath) || {}

suite('Tests', () => {
  test('Test CRC', async () => {
    const filePath = path.join(projectFolder, './src/test/fixtures/tit.tn_check');
    assert.ok(fs.existsSync(filePath))
    const checksum = await getChecksum(filePath)
    assert.equal(checksum, 'b28d94cdc04a30619fb81aabd3500eaf885824b835ecd1e061f11e69fe336225')
  });
});

const server = 'https://git.door43.org'
const token = env.TOKEN || '';
const owner = env.USER || '';
const targetLanguageId = 'pizza';
const targetBibleId = 'ult';
const glLanguageId = 'en';
const bookId = 'tit';
const repo = getRepoName(targetLanguageId, targetBibleId, glLanguageId, bookId);
const testBranchName = 'update_current';
const testProject = env.TEST_PROJECT || '';
const testRepoPath = path.join(ospath.home(), testProject)

suite('Repo Tests', async ()=> {
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
    const newBranch = testBranchName;
    const branch = await createRepoBranch(server, owner, repo, newBranch, token)
    assert.ok(!branch.error)
    assert.equal(branch.name, newBranch)
  })

  test('Test getOwners', async () => {
    const results = await getOwners(server)
    assert.ok(!results.error)
    const ownerNames = results?.owners?.map(owner => owner.login) || []
    console.log(`repoNames length ${ownerNames?.length}`, ownerNames)
    assert.ok(results.owners?.length)
  })

  test('Test getReposForOwner', async () => {
    const results = await getReposForOwner(server, owner)
    assert.ok(!results.error)
    const repoNames = results?.repos?.map(repo => repo.name) || []
    console.log(`repoNames length ${repoNames?.length}`, repoNames)
    assert.ok(results.repos?.length)
  })

  test('Test getCheckingReposForOwner', async () => {
    const results = await getCheckingReposForOwner(server, owner)
    assert.ok(!results.error)
    const repoNames = results?.repos?.map(repo => repo.name) || []
    console.log(`repoNames length ${repoNames?.length}`, repoNames)
    // assert.ok(results.repos?.length)
  })

  test('Test downloadRepo', async () => {
    const branch = 'master'
    const repo = env.REPO || ''
    const results = await downloadPublicRepoFromBranch(testRepoPath, server, owner, repo, branch)
    assert.ok(!results.error)
  })

  test('Test createRepoFile', async () => {
    const branch = testBranchName;
    const filePath = path.join(projectFolder, './src/test/fixtures/tit.tn_check');

    const branchFilePath = 'fixtures/tit.tn_check';
    const results = await uploadRepoFileFromPath(server, owner, repo, branch, branchFilePath, filePath, token)
    assert.ok(!results.error)
    assert.ok(results.content.html_url)
    assert.equal(results.content.name, branchFilePath)
  })

  test('Test getAllFiles', async () => {
    const files = getAllFiles(testRepoPath);
    assert.ok(files.length)
    for (const file of files) {
      const fullFilePath = path.join(testRepoPath, file);
      assert.ok(fs.existsSync(fullFilePath))
    }
  })

  test('Test getChangedFiles', async () => {
    const results = await getChangedFiles(server, owner, repo, 8, token)
    console.log(results)
  })

  test('Test updateFilesInDCS', async () => {
    const state = {}
    const results = await updateContentOnDCS(server, owner, repo, token, testRepoPath, state)
    console.log(results)
  })

  test('Test uploadRepoToDCS', async () => {
    const results = await uploadRepoToDCS(server, owner, repo, token, testRepoPath)
    console.log(results)
  })

  test.skip('Test createRepository', async () => {
    const results = await createCheckingRepository(server, owner, repo, token)
    assert.ok(!results.error)
    assert.equal(results.name, repo)
  })
})

