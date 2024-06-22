// @ts-ignore
import * as fs from 'fs-extra';
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import { readHelpsFolder } from './folderUtils'
// @ts-ignore
import { apiHelpers, BooksOfTheBible } from 'tc-source-content-updater'
// helpers
const {
    default: SourceContentUpdater,
    downloadHelpers,
    resourcesHelpers,
    resourcesDownloadHelpers,
} = require('tc-source-content-updater');


const RESOURCE_ID_MAP = {
    'tw': 'translationWords',
    'twl': 'translationWordsLinks',
    'tn': 'translationNotes',
    'ta': 'translationAcademy'
}

const checkingHelpsResources = [
    { id:'ta' }, { id:'tw' }, { id:'twl', bookRes: true }, { id: 'tn', bookRes: true }]


/**
 * merge helps folder into single json file
 * @param {object} resource - current resource
 * @param {string} resourcesPath - parent path for resources
 * @param {string} folderPath - destination path for combined json
 * @param {string[]} resourceFiles - destination for list of resources paths found
 * @param {boolean} byBook - if true then separate resources by book
 */
function processHelpsIntoJson(resource:any, resourcesPath:string, folderPath:string, resourceFiles:string[], byBook:boolean) {
    const bookIds = Object.keys(BooksOfTheBible.ALL_BIBLE_BOOKS)
    if (!byBook) {
        const contents = readHelpsFolder(folderPath)
        fs.removeSync(folderPath) // remove unzipped files
        fs.ensureDirSync(folderPath)
        const outputPath = path.join(folderPath, `${resource.resourceId}.json`)
        fs.outputJsonSync(outputPath, contents, { spaces: 2 })
        resourceFiles.push(outputPath)
    } else {
        const outputFolder = path.join(folderPath, '../temp')
        for (const bookId of bookIds) {
            const contents = readHelpsFolder(folderPath, bookId)
            // fs.removeSync(folderPath) // remove unzipped files
            // fs.ensureDirSync(folderPath)
            const outputPath = path.join(outputFolder, `${resource.resourceId}_${bookId}.json`)
            fs.outputJsonSync(outputPath, contents, { spaces: 2 })
            resourceFiles.push(outputPath)
        }
        fs.removeSync(folderPath) // remove unzipped files
        fs.moveSync(outputFolder, folderPath)
    }
}

/**
 * download selected resource from DCS
 * @param {object} resource - selected resource
 * @param {string} resourcesPath - parent path for resources
 * @param {boolean} byBook - if true then separate resources by book
 * @param {boolean} combineHelps - if true then combine resources to single json
 * @returns {Promise<{byBook: boolean, resource, resourcePath: *, resourceFiles: *[]}>}
 */
async function downloadAndProcessResource(resource:any, resourcesPath:string, byBook = false, combineHelps = false) {
    try {
        const result = await resourcesDownloadHelpers.downloadAndProcessResource(resource, resourcesPath, [])
        const resourceFiles:string[] = []
        // @ts-ignore
        const resourceName = RESOURCE_ID_MAP[resource.resourceId] || ''
        const folderPath = path.join(resourcesPath, resource.languageId, 'translationHelps', resourceName, `v${resource.version}_${resource.owner}`)
        if (combineHelps) {
            processHelpsIntoJson(resource, resourcesPath, folderPath, resourceFiles, byBook)
        }
        return { resourcePath: folderPath, resourceFiles, resource, byBook};
    } catch (e) {
        const message = `Source Content Update Errors caught!!!\n${e}`;
        console.error(message);
    }

    return null
}

/**
 * find the latest version resource folder in resourcesPath
 * @param {string} resourcePath - path to search
 * @returns {Promise<null>}
 */
async function getLatestResources(resourcePath:string) {
    const sourceContentUpdater = new SourceContentUpdater();
    await sourceContentUpdater.getLatestResources([], resourcePath)
    const updatedCatalogResources = sourceContentUpdater.updatedCatalogResources;
    return updatedCatalogResources;
}

/**
 * search catalog to find a match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourceId
 * @returns {*|null} returns match found
 */
function findResource(catalog:any[], languageId:string, owner:string, resourceId:string) {
    for (const item of catalog) {
        const lang = item.languageId
        const owner_ = item.owner
        if ((lang === languageId) && (owner === owner_)) {
            if (resourceId == item.resourceId) {
                console.log('Found', item)
                return item
            }
        }
    }
    return null
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
async function getLangHelpsResourcesFromCatalog(catalog:any[], languageId:string, owner:string, resourcesPath:string) {
    if (!catalog?.length) {
        catalog = await getLatestResources(resourcesPath)
    }

    const found = []
    for (const resource of checkingHelpsResources) {
        const item = findResource(catalog, languageId, owner, resource.id)
        if (item) {
            item.bookRes = resource.bookRes
            found.push(item)
        } else {
            console.error('getLangHelpsResourcesFromCatalog - Resource item not found', {languageId, owner, resourceId: resource.id})
        }
    }
    const processed = []
    for (const item of found) {
        console.log('getLangHelpsResourcesFromCatalog - downloading', item)
        const resource_ = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
        if (resource_) {
            processed.push(resource_)
        } else {
            console.error('getLangHelpsResourcesFromCatalog - could not download Resource item', {languageId, owner, resourceId: item.id})
        }
    }
    for(const item of processed) {
        console.log(item)
        processHelpsIntoJson(item.resource, resourcesPath, item.resourcePath, item.resourceFiles, item.byBook)
    }
    return { processed, updatedCatalogResources: catalog }
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies and aligned bibles
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
async function getLangResourcesFromCatalog(catalog:any[], languageId:string, owner:string, resourcesPath:string) {
    const { processed, updatedCatalogResources } = await getLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath)

    // get aligned bibles
    const alignedBiblesList = [['glt', 'ult'], ['gst', 'ust']]
    for (const alignedBibles of alignedBiblesList) {
        let fetched = false
        for (const bibleId of alignedBibles) {
            const item = findResource(updatedCatalogResources, languageId, owner, bibleId)
            if (item) {
                console.log('getLangResourcesFromCatalog - downloading', item)
                const resource = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
                if (resource) {
                    processed.push(resource)
                    fetched = true
                } else {
                    console.error('getLangResourcesFromCatalog - Resource item not downloaded', { languageId, owner, bibleId })
                }
            }
        }
        if (!fetched) {
            console.error('getLangResourcesFromCatalog - Resource item not downloaded for list', {
                languageId,
                owner,
                alignedBibles
            })
        }
    }

    return { processed, updatedCatalogResources }
}

/**
 * search catalog to find and download bible match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourceId
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<*>} -
 */
async function fetchBibleResource(catalog:any[], languageId:string, owner:string, resourceId:string, resourcesPath:string) {
    const item = findResource(catalog, languageId, owner, resourceId)
    if (item) {
        const downloadUrl = item.downloadUrl
        try {
            const destFolder = path.join(resourcesPath, item.owner, item.languageId, 'bible', `${item.resourceId}`)
            const importFolder = path.join(resourcesPath, 'imports')
            const zipFolder = path.join(importFolder, `v${item.version}_${item.owner}_${item.resourceId}`)
            fs.ensureDirSync(zipFolder)
            const zipFileName = `${item.languageId}_${item.resourceId}_v${item.version}_${encodeURIComponent(item.owner)}.zip`;
            const zipFilePath = path.join(zipFolder, zipFileName)
            let importPath;
            console.log('fetching')
            const results = await downloadHelpers.download(downloadUrl, zipFilePath)

            if (results.status === 200) {
                // downloadComplete = true;
                try {
                    console.log('Unzipping: ' + downloadUrl);
                    importPath = await resourcesHelpers.unzipResource(item, zipFilePath, resourcesPath);
                    console.log('importPath', importPath)
                } catch (err) {
                    console.log(err)
                    throw err;
                }

                console.log(results)
                if (importPath) {
                    const sourcePath = path.join(importPath, `${item.languageId}_${item.resourceId}`)
                    fs.moveSync(sourcePath, destFolder)
                    fs.removeSync(importFolder)
                }
                return results
            } else {
                const message = `Download ${downloadUrl} error, status: ${results.status}`
                console.log(message)
                throw message
            }
        } catch (err) {
            console.log(err)
        }
    }
    return null
}

/**
 * iterate through resources array and organize by language and owner
 * @param {object[]} resources
 * @returns {{}} - object containing organized resources
 */
export const createLanguagesObjectFromResources = (resources:any[]) => {
    const result = {};

    resources.forEach((item) => {
        const languageId = item?.languageId
        const owner = item?.owner
        const resourceId = item?.resourceId
        // @ts-ignore
        let langObject = result[languageId]
        if (!langObject) {
            langObject = {}
            // @ts-ignore
            result[languageId] = langObject
        }

        let ownerObject = langObject[owner]
        if (!ownerObject) {
            ownerObject = {}
            langObject[owner] = ownerObject
        }

        ownerObject[resourceId] = item
    });

    return result;
};

/**
 * filter out any translation helps resources that are not complete (ta, tw, tn, twl)
 * @param {object} resourcesObject
 * @returns {{}} - new filtered resources object
 */
export const filterCompleteCheckingResources = (resourcesObject:any) => {
    const result = {};

    for (const languageId of Object.keys(resourcesObject).sort()) {
        let langObject = resourcesObject[languageId]
        if (!langObject) {
            langObject = {}
        }

        for (const owner of Object.keys(langObject).sort()) {
            let ownerObject = langObject[owner]
            if (!ownerObject) {
                ownerObject = {}
            }

            let foundAll = true
            let found = {  }
            for (const desiredResource of checkingHelpsResources) {
                const resourceId = desiredResource?.id
                const foundResource = ownerObject?.[resourceId]
                if (foundResource) {
                    // @ts-ignore
                    found[resourceId] = foundResource
                } else {
                    foundAll = false
                    break
                }
            }
            if (foundAll) {
                // @ts-ignore
                let langObject = result[languageId]
                if (!langObject) {
                    langObject = {}
                    // @ts-ignore
                    result[languageId] = langObject
                }

                langObject[owner] = found
            }
        }
    }

    return result;
};

function verifyHaveHelpsResource(resource:any, resourcesPath:string, languageId:string, owner:string, catalog:null|any[] = null) {
    // @ts-ignore
    const resourceName = RESOURCE_ID_MAP[resource.id] || ''
    const folderPath = path.join(resourcesPath, languageId, 'translationHelps', resourceName) // , `v${resource.version}_${resource.owner}`)
    const versionPath = resourcesHelpers.getLatestVersionInPath(folderPath, owner, false)

    if (versionPath && fs.pathExistsSync(versionPath)) {
        if (catalog) {
            const {version, owner} = resourcesHelpers.getVersionAndOwnerFromPath(versionPath)
            const item = findResource(catalog, languageId, owner, resource.id)
            if (item) {
                const currentVersion = apiHelpers.formatVersionWithV(version)
                const latestVersion = apiHelpers.formatVersionWithV(item.version)
                const comparion = resourcesHelpers.compareVersions(currentVersion, latestVersion )
                if (comparion >= 0) {
                    // version is good
                } else {
                    console.log(`verifyHaveHelpsResource() - Expected version '${item.version}', but currently have '${version}'`)
                    return false
                }
            }
        }
        if (!resource?.bookRes) {
            const filePath = path.join(versionPath, `${resource?.id}.json`)
            if (fs.pathExistsSync(filePath)) {
                return true
            } else {
                console.log(`verifyHaveHelpsResource() - Could not find file: ${versionPath}`)
                return false
            }
        } else { // by book
            const files = fs.readdirSync(versionPath).filter((filename:string) => path.extname(filename) === '.json')
            if (files?.length) {
                return true
            } else {
                console.log(`verifyHaveHelpsResource() - Could not find files in : ${versionPath}`)
                return false
            }
        }
    } else {
        console.log(`verifyHaveHelpsResource() - Could not find folder: ${folderPath}`)
        return false
    }
}

/**
 * make sure specific bible resouce is already downloaded, and if catalog give, make sure it is valid version
 * @param {string} bibleId
 * @param {string} resourcesPath
 * @param {string} languageId
 * @param {string} owner
 * @param  {object[]} catalog - if given then also validate version is equal to or greater than catalog:any[] version
 * @returns {boolean} - true if found and valid
 */
function verifyHaveBibleResource(bibleId:string, resourcesPath:string, languageId:string, owner:string, catalog:null|any[] = null) {
    const folderPath = path.join(resourcesPath, languageId, 'bibles', bibleId) // , `v${resource.version}_${resource.owner}`)
    const versionPath = resourcesHelpers.getLatestVersionInPath(folderPath, owner, false)

    if (versionPath && fs.pathExistsSync(versionPath)) {
        if (catalog) {
            const {version, owner} = resourcesHelpers.getVersionAndOwnerFromPath(versionPath)
            const item = findResource(catalog, languageId, owner, bibleId)
            if (item) {
                const currentVersion = apiHelpers.formatVersionWithV(version)
                const latestVersion = apiHelpers.formatVersionWithV(item.version)
                const comparion = resourcesHelpers.compareVersions(currentVersion, latestVersion )
                if (comparion >= 0) {
                    // version is good
                } else {
                    console.log(`verifyHaveBibleResource() - Expected version '${item.version}', but currently have '${version}'`)
                    return false
                }
            }
        }

        const books = fs.readdirSync(versionPath)
            .filter((file:string) => path.extname(file) !== '.json' && file !== '.DS_Store');
        if (books?.length) {
            return true
        } else {
            console.log(`verifyHaveBibleResource() - Could not find files in : ${versionPath}`)
        }
    } else {
        console.log(`verifyHaveBibleResource() - Could not find folder: ${folderPath}`)
    }
    return false
}


/**
 * look in resourcesPath to make sure we have all the GL translationHelps resources needed for GL
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath
 * @param {object[]} catalog - if given then also validate version is equal to or greater than catalog version
 * @returns {boolean}
 */
function verifyHaveGlHelpsResources(languageId:string, owner:string, resourcesPath:string, catalog:null|any[] = null) {
    let found = true
    for (const resource of checkingHelpsResources) {
        let foundItem = verifyHaveHelpsResource(resource, resourcesPath, languageId, owner, catalog)

        if (!foundItem) {
            found = false
            break
        }
    }
    return found
}

/**
 * look in resourcesPath to make sure we have all the GL resources needed for GL as well as original languages
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath
 * @param {object[]} catalog - if given then also validate version is equal to or greater than catalog version
 * @returns {boolean}
 */
function verifyHaveGlResources(languageId:string, owner:string, resourcesPath:string, catalog:null|any[] = null) {
    let found = verifyHaveGlHelpsResources(languageId, owner, resourcesPath, catalog)

    if (found) { // verify have orig languages and aligned bibles
        const alignedBiblesList = [['ugnt'], ['uhb'], ['glt', 'ult'], ['gst', 'ust']]
        for (const alignedBibles of alignedBiblesList) {
            let alreadyHave = false
            for (const bibleId of alignedBibles) {
                const { languageId_, owner_ } = getLanguageAndOwnerForBible(languageId, owner, bibleId)
                const alreadyHave_ = verifyHaveBibleResource(bibleId, resourcesPath, languageId_, owner_, catalog)
                if (alreadyHave_) {
                    alreadyHave = alreadyHave_
                }
            }
            if (!alreadyHave) {
                console.error('verifyHaveGlResources - Resource item not downloaded for bible', {
                    languageId,
                    owner,
                    alignedBibles
                })
                found = false
            }
        }
    }

    return found
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
async function getLatestLangHelpsResourcesFromCatalog(catalog:any[], languageId:string, owner:string, resourcesPath:string) {
    if (!catalog?.length) {
        catalog = await getLatestResources(resourcesPath)
    }

    const processed:any[] = []
    let haveResources = verifyHaveGlHelpsResources(languageId, owner, resourcesPath)
    if (haveResources) {
        return { processed, updatedCatalogResources: catalog }
    }

    const found = []
    for (const resource of checkingHelpsResources) {
        const item = findResource(catalog, languageId, owner, resource.id)
        if (item) {
            item.bookRes = resource.bookRes
            found.push(item)
        } else {
            console.error('getLangHelpsResourcesFromCatalog - Resource item not found', {languageId, owner, resourceId: resource.id})
        }
    }
    for (const item of found) {
        console.log('getLangHelpsResourcesFromCatalog - downloading', item)
        const resource_ = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
        if (resource_) {
            processed.push(resource_)
        } else {
            // @ts-ignore
            console.error('getLangHelpsResourcesFromCatalog - could not download Resource item', {languageId, owner, resourceId: resource.id})
        }
    }
    for(const item of processed) {
        console.log(item)
        // @ts-ignore
        processHelpsIntoJson(item.resource, resourcesPath, item.resourcePath, item.resourceFiles, item.byBook)
    }
    return { processed, updatedCatalogResources: catalog }
}

/**
 * thre original language bibles are always from unfoldingWrod and have specific languageId
 * @param {string} languageId
 * @param {string} owner
 * @param {string} bibleId
 * @returns {{languageId_: string, owner_: string}}
 */
function getLanguageAndOwnerForBible(languageId:string, owner:string, bibleId:string) {
    let languageId_ = languageId
    let owner_ = owner
    if (bibleId === 'ugnt') {
        languageId_ = 'el-x-koine'
        owner_ = 'unfoldingWord'
    } else if (bibleId === 'uhb') {
        languageId_ = 'hbo'
        owner_ = 'unfoldingWord'
    }
    return { languageId_, owner_ }
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies and aligned bibles
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
async function getLatestLangResourcesFromCatalog(catalog:any[], languageId:string, owner:string, resourcesPath:string) {
    const { processed, updatedCatalogResources } = await getLatestLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath)

    // get aligned bibles
    const alignedBiblesList = [['glt', 'ult'], ['gst', 'ust']]
    for (const alignedBibles of alignedBiblesList) {
        let fetched = false
        for (const bibleId of alignedBibles) {
            const { languageId_, owner_ } = getLanguageAndOwnerForBible(languageId, owner, bibleId)

            const alreadyHave_ = verifyHaveBibleResource(bibleId, resourcesPath, languageId_, owner_, catalog)
            if (alreadyHave_) {
                fetched = true
                break
            }
        }

        if (!fetched) {
            for (const bibleId of alignedBibles) {
                const { languageId_, owner_ } = getLanguageAndOwnerForBible(languageId, owner, bibleId)
                const item = findResource(updatedCatalogResources, languageId_, owner_, bibleId)
                if (item) {
                    console.log('getLangResourcesFromCatalog - downloading', item)
                    const resource = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
                    if (resource) {
                        processed.push(resource)
                        fetched = true
                    } else {
                        console.error('getLangResourcesFromCatalog - Resource item not downloaded', { languageId_, owner_, bibleId })
                    }
                }
            }
        }

        if (!fetched) {
            console.error('getLangResourcesFromCatalog - Resource item not downloaded for list', {
                languageId,
                owner,
                alignedBibles
            })
        }
    }

    return { processed, updatedCatalogResources: catalog }
}

/**
 * Initialize folder of project
 * @param repoPath
 * @param targetLanguageId
 * @param targetOwner
 * @param targetBibleId
 * @param gl_languageId
 * @param gl_owner
 * @param resourcesBasePath
 * @param sourceResourceId
 */
export function initProject(repoPath:string, targetLanguageId:string, targetOwner:string, targetBibleId:string, gl_languageId:string, gl_owner:string, resourcesBasePath:string, sourceResourceId:string) {
    const exists = fs.pathExistsSync(repoPath)
    if (!exists) {
        try {
            let sourceTsvsPath;
            switch (sourceResourceId) {
                case 'tn':
                case 'twl':
                    const resourceName = RESOURCE_ID_MAP[sourceResourceId] || ''
                    const folderPath = path.join(resourcesBasePath, gl_languageId, 'translationHelps', resourceName)
                    sourceTsvsPath = resourcesHelpers.getLatestVersionInPath(folderPath, gl_owner, false)
                    break

                default:
                    console.error(`initProject - unsupported source project ID: ${sourceResourceId}`)
                    return false
            }

            fs.ensureDirSync(repoPath)
            fs.copySync(sourceTsvsPath, repoPath)

            // create check json files
            const files = fs.readdirSync(repoPath).filter((filename:string) => path.extname(filename) === '.json')
            if (files?.length) {
                for (const filename of files) {
                    let newName = filename.replace('.json', '.check')
                    if (newName !== filename) {
                        fs.moveSync(path.join(repoPath, filename), path.join(repoPath, newName))
                    }
                }
            }

            // create manifest
            const manifest = {
                resourceType: 'Translation Checker',
                checkingType: sourceResourceId,
                languageId: targetLanguageId,
                gatewayLanguageId: gl_languageId,
                gatewayLanguageOwner: gl_owner,
                resourcesPath: resourcesBasePath,
                sourceTsvsPath
            }
            const outputPath = path.join(repoPath, `manifest.json`)
            fs.outputJsonSync(outputPath, manifest, { spaces: 2 })
            return true

        } catch (e) {
            console.error(`initProject - error creating project: ${repoPath}`)
        }
    } else {
        console.error(`initProject - cannot initialize folder because it already exists: ${repoPath}`)
    }
    return false
}