// @ts-ignore
import * as fs from 'fs-extra';
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import { initProject } from "../utilities/checkerFileUtils";


// jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Tests for resourcesDownloadHelpers.downloadAndProcessResource()', () => {
  const resourcesPath = path.join(ospath.home(), 'translationCore/temp/downloaded');
  const updatedResourcesPath = path.join(resourcesPath, 'updatedResources.json')
  const completeResourcesPath = path.join(resourcesPath, 'completeResources.json')

  it('Test initProject tn', async () => {
    const gl_owner = 'unfoldingWord'
    const gl_languageId = 'en'
    const languageId = 'en'
    const projectId = 'tn'
    const targetLanguageId = 'es-419'
    const targetOwner = 'es-419_gl'
    const targetBibleId = 'glt'
    const repoPath = path.join(resourcesPath, '../projects', `${languageId}_${projectId}`)
    const success = await initProject(repoPath, targetLanguageId, targetOwner, targetBibleId, gl_languageId, gl_owner, resourcesPath, projectId)
    expect(success).toBeTruthy()
  })
})
