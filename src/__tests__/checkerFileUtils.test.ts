// @ts-ignore
import * as fs from 'fs-extra';
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import { getResourcesForChecking, initProject } from "../utilities/checkerFileUtils";
const resourcesList = require('./fixtures/updatedResources.json');


// jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Tests for resourcesDownloadHelpers.downloadAndProcessResource()', () => {
  const workingPath = path.join(ospath.home(), 'translationCore')
  const resourcesPath = path.join(workingPath, 'cache')
  const projectsPath = path.join(workingPath, 'otherProjects')
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
    const repoPath = path.join(projectsPath, `${targetLanguageId}_${targetBibleId}`)
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
    expect(resources.lexicons).toBeTruthy()
    // @ts-ignore
    expect(resources.locales).toBeTruthy()
    // @ts-ignore
    expect(resources.twl).toBeTruthy()
    // @ts-ignore
    expect(resources.tw).toBeTruthy()
    // @ts-ignore
    expect(resources.project).toBeTruthy()
    // @ts-ignore
    expect(resources.bibles.length).toEqual(3)
    // @ts-ignore
    expect(resources.targetBible).toBeTruthy()
  })

})
