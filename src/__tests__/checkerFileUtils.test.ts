// @ts-ignore
import * as fs from 'fs-extra';
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import {
  getBookIdFromPath,
  getProjectIdFromPath,
  getResourcesForChecking,
  initProject,
  isRepoInitialized,
  loadResourcesFromPath,
} from "../utilities/checkerFileUtils";
const resourcesList = require('./fixtures/updatedResources.json');


// jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Tests for resourcesDownloadHelpers.downloadAndProcessResource()', () => {
  const workingPath = path.join(ospath.home(), 'translationCore')
  const projectsPath = path.join(workingPath, 'otherProjects')
  const resourcesPath = path.join(projectsPath, 'cache')
  // const updatedResourcesPath = path.join(resourcesPath, 'updatedResources.json')
  // const completeResourcesPath = path.join(resourcesPath, 'completeResources.json')

  it('Test initProject twl', async () => {
    const gl_owner = 'unfoldingWord'
    const gl_languageId = 'en'
    const languageId = 'en'
    const projectId = 'twl'
    const targetLanguageId = 'es-419'
    const targetOwner = 'es-419_gl'
    const targetBibleId = 'glt'
    const repoPath = path.join(projectsPath, `${targetLanguageId}_${targetBibleId}_twl`)
    const success = await initProject(repoPath, targetLanguageId, targetOwner, targetBibleId, gl_languageId, gl_owner, resourcesPath, projectId, resourcesList)
    expect(success).toBeTruthy()
  })

  it('Test initProject tn', async () => {
    const gl_owner = 'unfoldingWord'
    const gl_languageId = 'en'
    const languageId = 'en'
    const projectId = 'tn'
    const targetLanguageId = 'es-419'
    const targetOwner = 'es-419_gl'
    const targetBibleId = 'glt'
    const repoName = `${targetLanguageId}_${targetBibleId}_tn`;
    const repoPath = path.join(projectsPath, repoName)
    const success = await initProject(repoPath, targetLanguageId, targetOwner, targetBibleId, gl_languageId, gl_owner, resourcesPath, projectId, resourcesList)
    expect(success).toBeTruthy()
  })

  it('Test initProject all', async () => {
    const gl_owner = 'unfoldingWord'
    const gl_languageId = 'en'
    const languageId = 'en'
    const projectId = null
    const targetLanguageId = 'es-419'
    const targetOwner = 'es-419_gl'
    const targetBibleId = 'glt'
    const repoName = `${targetLanguageId}_${targetBibleId}`;
    const repoPath = path.join(projectsPath, repoName)
    const success = await initProject(repoPath, targetLanguageId, targetOwner, targetBibleId, gl_languageId, gl_owner, resourcesPath, projectId, resourcesList)
    expect(success).toBeTruthy()
  })

  it('Test getResourcesForChecking twl', async () => {
    const projectId = 'twl'
    const targetLanguageId = 'es-419'
    const targetBibleId = 'glt'
    const bookId = 'tit'
    const repoPath = path.join(projectsPath, `${targetLanguageId}_${targetBibleId}`)
    const resources = getResourcesForChecking(repoPath, resourcesPath, projectId, bookId)
    // @ts-ignore
    expect(resources.validResources).toBeTruthy()
  })

  it('Test loadResourcesFromPath 3jn.twl_check', () => {
    const projectId = 'twl'
    const targetLanguageId = 'es-419'
    const targetBibleId = 'glt'
    const bookId = '3jn'
    const repoName = `${targetLanguageId}_${targetBibleId}`;
    const repoPath = path.join(projectsPath, repoName)
    const checkingFile = path.join (repoPath, `checking/${projectId}/${projectId}_${bookId}.${projectId}_check`)
    const resources = loadResourcesFromPath(checkingFile, resourcesPath)
    // @ts-ignore
    expect(resources.validResources).toBeTruthy()
  })

  it('Test loadResourcesFromPath 3jn.tn_check', () => {
    const projectId = 'tn'
    const targetLanguageId = 'es-419'
    const targetBibleId = 'glt'
    const bookId = '3jn'
    const repoName = `${targetLanguageId}_${targetBibleId}`;
    const repoPath = path.join(projectsPath, repoName)
    const checkingFile = path.join (repoPath, `checking/${projectId}/${projectId}_${bookId}.${projectId}_check`)
    const resources = loadResourcesFromPath(checkingFile, resourcesPath)
    // @ts-ignore
    expect(resources.validResources).toBeTruthy()
  })

  it('Test isRepoInitialized all', () => {
    const projectId = null
    const targetLanguageId = 'es-419'
    const targetBibleId = 'glt'
    const bookId = '3jn'
    const repoName = `${targetLanguageId}_${targetBibleId}`;
    const repoPath = path.join(projectsPath, repoName)
    const checkingFile = path.join (repoPath, `checking/${projectId}/${projectId}_${bookId}.${projectId}_check`)
    const results = isRepoInitialized(repoPath, resourcesPath, projectId)
    // @ts-ignore
    expect(results.error).toBeFalsy()
    expect(results.repoExists).toBeTruthy()
    expect(results.metaDataInitialized).toBeTruthy()
    expect(results.checksInitialized).toBeTruthy()
    expect(results.translationHelpsLoaded).toBeTruthy()
    expect(results.bibleBooksLoaded).toBeTruthy()
  })
  
})

const tests = [
  
]

describe('Tests for getBookIdFromPath()', () => {
  // iterate through tests in table and verify results
  test.each`
  testData    | expected
  ${'./path/tn_heb.tn_check'} | ${'heb'}
  ${'./path/twl_luk.twl_check'}  | ${'luk'}
  ${'tn_jud.tn_check'} | ${'jud'}
  ${'twl_rut.twl_check'}  | ${'rut'}
  ${'tn_isa'} | ${'isa'}
  ${'twl_mrk'}  | ${'mrk'}
  ${'1jn'} | ${'1jn'}
  ${'2co.check'} | ${'2co'}
  ${'3jn_tn'}  | ${'3jn'}
  ${'revt'}  | ${null}
  ${''} | ${null}
  ${null} | ${null}
  ${undefined} | ${null}
  `('match of "$testData" should return "$expected"', ({ testData, expected }) => {
      const results = getBookIdFromPath(testData)
      expect(results).toEqual(expected);
    });
})

describe('Tests for getProjectIdFromPath()', () => {
  // iterate through tests in table and verify results
  test.each`
  testData    | expected
  ${'./path/tn_heb.tn_check'} | ${'tn'}
  ${'./path/twl_luk.twl_check'}  | ${'twl'}
  ${'tn_jud.tn_check'} | ${'tn'}
  ${'twl_rut.twl_check'}  | ${'twl'}
  ${'tn_isa'} | ${null}
  ${'twl_mrk'}  | ${null}
  ${'1jn'} | ${null}
  ${'2co.check'} | ${null}
  ${'3jn_tn'}  | ${null}
  ${'revt'}  | ${null}
  ${''} | ${null}
  ${null} | ${null}
  ${undefined} | ${null}
  `('match of "$testData" should return "$expected"', ({ testData, expected }) => {
    const results = getProjectIdFromPath(testData)
    expect(results).toEqual(expected);
  });
})
