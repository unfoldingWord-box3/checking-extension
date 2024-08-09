// @ts-ignore
import * as fs from 'fs-extra';
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
// @ts-ignore
import * as usfmjs from "usfm-js";
// @ts-ignore
import * as YAML from 'yamljs';
import { objectNotEmpty, readHelpsFolder } from "./folderUtils";
import * as BooksOfTheBible from "./BooksOfTheBible";
import { BIBLE_BOOKS } from "./BooksOfTheBible";
import { ResourcesObject } from "../../types";
import { getLanguage } from "./languages";
// helpers
const {
    apiHelpers,
    default: SourceContentUpdater,
    downloadHelpers,
    resourcesHelpers,
    resourcesDownloadHelpers,
    twArticleHelpers
}
// @ts-ignore
  = require('tc-source-content-updater');

const workingPath = path.join(ospath.home(), 'translationCore')
export const projectsBasePath = path.join(workingPath, 'otherProjects')
export const resourcesPath = path.join(projectsBasePath, 'cache')
const updatedResourcesPath = path.join(resourcesPath, "updatedResources.json");

const { lexicons } = require('../data/lexicons')
const { locales } = require('../data/locales/English-en_US')

const checkingName = 'translation.checker'

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
async function processHelpsIntoJson(resource:any, resourcesPath:string, folderPath:string, resourceFiles:string[], byBook:boolean, ignoreIndex = false) {
    const bookIds = Object.keys(BooksOfTheBible.ALL_BIBLE_BOOKS)
    const tempFolder = path.join(folderPath, '../temp')
    let moveSuccess = false
    for (let i = 0; i < 3; i++) {
        try {
            fs.moveSync(folderPath, tempFolder);
            moveSuccess = true
            break
        } catch (e) {
            await delay(500);
            console.warn(`processHelpsIntoJson - could not move folder ${folderPath}`, e)
        }
    }
    if (moveSuccess) {
        try {
            if (!byBook) {
                const contents = readHelpsFolder(tempFolder, '', ignoreIndex)
                fs.ensureDirSync(folderPath)
                const outputPath = path.join(folderPath, `${resource.resourceId}.json`)
                fs.outputJsonSync(outputPath, contents, { spaces: 2 })
                resourceFiles.push(outputPath)
            } else {
                for (const bookId of bookIds) {
                    const contents = readHelpsFolder(tempFolder, bookId, ignoreIndex)
                    if (objectNotEmpty(contents)) {
                        fs.ensureDirSync(folderPath);
                        const outputPath = path.join(folderPath, `${resource.resourceId}_${bookId}.json`);
                        fs.outputJsonSync(outputPath, contents, { spaces: 2 });
                        resourceFiles.push(outputPath);
                    }
                }
            }
            fs.removeSync(tempFolder)
            return true
        } catch (e) {
            console.error(`processHelpsIntoJson - failed to process folder`, folderPath, e)
            return false
        }
    }

    console.error(`processHelpsIntoJson - failed to process folder`, folderPath)
    return false
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
        const errorsList:string[] = [];
        const downloadErrorsList:string[] = [];
        const importFolder = path.join(resourcesPath, 'imports')
        fs.emptyDirSync(importFolder) // clear imports folder to remove leftover files
        const result = await resourcesDownloadHelpers.downloadAndProcessResourceWithCatch(resource, resourcesPath, errorsList, downloadErrorsList)
        const resourceFiles:string[] = []
        let folderPath:null|string = null
        // @ts-ignore
        const resourceName = RESOURCE_ID_MAP[resource.resourceId] || ''
        if (resourceName) {
            folderPath = path.join(resourcesPath, resource.languageId, "translationHelps", resourceName, `v${resource.version}_${resourcesHelpers.encodeOwnerStr(resource.owner)}`);
        } else { // bibles
            folderPath = path.join(resourcesPath, resource.languageId, "bibles", resource.resourceId, `v${resource.version}_${resourcesHelpers.encodeOwnerStr(resource.owner)}`);
        }
        let success = true
        if (combineHelps) {
            const ignoreIndex = resource.resourceId === 'tn'
            success = await processHelpsIntoJson(resource, resourcesPath, folderPath, resourceFiles, byBook, ignoreIndex)
        }
        if (success) {
            return { resourcePath: folderPath, resourceFiles, resource, byBook};
        } else {
            console.error(`downloadAndProcessResource - could not process resource`, folderPath)
        }
    } catch (e) {
        const message = `downloadAndProcessResource - Source Content Update Errors caught!!!\n${e}`;
        console.error(message);
    }

    return null
}

/**
 * find the latest version resource folder in resourcesPath
 * @param {string} resourcePath - path of downloaded resources
 * @returns {Promise<null>}
 */
export async function getLatestResourcesCatalog(resourcePath:string) {
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
export function findResource(catalog:any[], languageId:string, owner:string, resourceId:string) {
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
 * search catalog to find a match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 */
export function findOwnersForLang(catalog:any[], languageId:string) {
    const owners = {}
    for (const item of catalog) {
        const langId = item.languageId
        if (langId === languageId) {
            const owner_ = item.owner
            // @ts-ignore
            owners[owner_] = true
        }
    }
    return Object.keys(owners).sort()
}

/**
 * search catalog to find a match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 */
export function findResourcesForLangAndOwner(catalog:any[], languageId:string, owner:string) {
    const resources = catalog.filter(item => {
        const langId = item.languageId
        const owner_ = item.owner
        const match = (langId === languageId) && (owner_ === owner);
        return match 
    })
    return resources
}

/**
 * search catalog to find a match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 */
export function findBibleResources(catalog:any[]) {
    const resources = catalog.filter(item => {
        const subject = (item?.subject || '').toLowerCase()
        const match = subject.includes('bible');
        return match
    })
    return resources
}

/**
 * search catalog to find a match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 */
export function getLanguagesInCatalog(catalog:any[]) {
    const codes = {}
    for (const item of catalog) {
        const langId = item.languageId
        // @ts-ignore
        codes[langId] = true
    }
    const languageIds = Object.keys(codes).sort();
    const languages = languageIds.map(langId => getLanguage(langId))
    return languages
}

/**
 * search catalog to find a match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 */
export function getResourceIdsInCatalog(catalog:any[]) {
    const resourceIds = {}
    for (const item of catalog) {
        const resourceId = item.resourceId
        // @ts-ignore
        resourceIds[resourceId] = true
    }
    const bibleIds = Object.keys(resourceIds).sort();
    return bibleIds
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
        catalog = await getLatestResourcesCatalog(resourcesPath)
        saveCatalog(catalog)
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
            const ignoreIndex = item.resourceId === 'tn'
            const success = await processHelpsIntoJson(item.resource, resourcesPath, item.resourcePath, item.resourceFiles, item.byBook, ignoreIndex)
            if (!success) {
                console.error('getLangHelpsResourcesFromCatalog - could not process', item)
            }
        } else {
            console.error('getLangHelpsResourcesFromCatalog - could not download Resource item', {languageId, owner, resourceId: item.id})
        }
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
            const destFolder = path.join(resourcesPath, item.languageId, 'bibles', `${item.resourceId}`,`v${item.version}_${resourcesHelpers.encodeOwnerStr(item.owner)}`)
            const importFolder = path.join(resourcesPath, 'imports')
            const zipFolder = path.join(importFolder, `v${item.version}_${resourcesHelpers.encodeOwnerStr(item.owner)}_${item.resourceId}`)
            fs.ensureDirSync(zipFolder)
            const zipFileName = `${item.languageId}_${item.resourceId}_v${item.version}_${resourcesHelpers.encodeOwnerStr(item.owner)}.zip`;
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
                    results.destFolder = destFolder
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

function verifyHaveHelpsResource(resource:any, resourcesPath:string, languageId:string, owner:string, catalog:null|any[] = null):null|object {
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
                    return null
                }
            }
        }

        const resourceObject = {
            id: resource?.id,
            languageId,
            path: versionPath
        }
        
        if (!resource?.bookRes) {
            const filePath = path.join(versionPath, `${resource?.id}.json`)
            if (fs.pathExistsSync(filePath)) {
                return resourceObject
            } else {
                console.log(`verifyHaveHelpsResource() - Could not find file: ${versionPath}`)
                return null
            }
        } else { // by book
            const files = fs.readdirSync(versionPath).filter((filename:string) => path.extname(filename) === '.json')
            if (files?.length) {
                return resourceObject
            } else {
                console.log(`verifyHaveHelpsResource() - Could not find files in : ${versionPath}`)
                return null
            }
        }
    } else {
        console.log(`verifyHaveHelpsResource() - Could not find folder: ${folderPath}`)
        return null
    }
}

/**
 * make sure specific bible resouce is already downloaded, and if catalog give, make sure it is valid version
 * @param {string} bibleId
 * @param {string} resourcesPath
 * @param {string} languageId
 * @param {string} owner
 * @param  {object[]} catalog - if given then also validate version is equal to or greater than catalog:any[] version
 * @returns {string|null} - path of resource if found
 */
function verifyHaveBibleResource(bibleId:string, resourcesPath:string, languageId:string, owner:string, catalog:null|any[] = null, checkForUsfm = false):null|string {
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
                    return null
                }
            }
        }

        let books = []
        if (checkForUsfm) { // each book is an USFM file
            books = getBibleFiles(versionPath)
        } else { // each book is a chapter
            books = fs.readdirSync(versionPath)
              .filter((file:string) => path.extname(file) !== '.json' && file !== '.DS_Store');
        }
        if (books?.length) {
            return versionPath
        } else {
            console.log(`verifyHaveBibleResource() - Could not find files in : ${versionPath}`)
        }
    } else {
        console.log(`verifyHaveBibleResource() - Could not find folder: ${folderPath}`)
    }
    return null
}


/**
 * look in resourcesPath to make sure we have all the GL translationHelps resources needed for GL
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath
 * @param {object[]} catalog - if given then also validate version is equal to or greater than catalog version
 * @returns {object}
 */
function verifyHaveGlHelpsResources(languageId:string, owner:string, resourcesPath:string, catalog:null|any[] = null) {
    let found = true
    const resources = {}
    for (const resource of checkingHelpsResources) {
        let resource_ = verifyHaveHelpsResource(resource, resourcesPath, languageId, owner, catalog)

        if (!resource_) {
            found = false
            break
        }
        
        // @ts-ignore
        resources[resource.id] = resource_
    }
    if (found) {
        return resources
    }
    return { }
}

/**
 * look in resourcesPath to make sure we have all the GL resources needed for GL as well as original languages
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath
 * @param {object[]} catalog - if given then also validate version is equal to or greater than catalog version
 * @returns {null|string}
 */
function verifyHaveGlResources(languageId:string, owner:string, resourcesPath:string, catalog:null|any[] = null):object {
    let resources = verifyHaveGlHelpsResources(languageId, owner, resourcesPath, catalog)

    if (Object.keys(resources)?.length) { // verify have orig languages and aligned bibles
        const alignedBiblesList = [['ugnt'], ['uhb'], ['glt', 'ult'], ['gst', 'ust']]
        for (const alignedBibles of alignedBiblesList) {
            let alreadyHave:string|null = null
            for (const bibleId of alignedBibles) {
                const { languageId_, owner_ } = getLanguageAndOwnerForBible(languageId, owner, bibleId)
                const foundPath = verifyHaveBibleResource(bibleId, resourcesPath, languageId_, owner_, catalog)
                if (foundPath) {
                    alreadyHave = foundPath
                    // @ts-ignore
                    resources[bibleId] = foundPath
                }
            }
            if (!alreadyHave) {
                console.error('verifyHaveGlResources - Resource item not downloaded for bible', {
                    languageId,
                    owner,
                    alignedBibles
                })
            }
        }
    }

    return resources
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
export async function downloadLatestLangHelpsResourcesFromCatalog(catalog:null|any[], languageId:string, owner:string, resourcesPath:string, callback:Function|null = null) {
    if (!catalog?.length) {
        catalog = await getLatestResourcesCatalog(resourcesPath)
    }
    callback && await callback('Downloaded Catalog')

    let error = false
    const processed:any[] = []
    let foundResources = verifyHaveGlHelpsResources(languageId, owner, resourcesPath)
    if (Object.keys(foundResources)?.length) {
        return {
            processed,
            updatedCatalogResources: catalog,
            foundResources
        }
    }

    foundResources = {}
    const found = []
    for (const resource of checkingHelpsResources) {
        const item = findResource(catalog || [], languageId, owner, resource.id)
        if (item) {
            item.bookRes = resource.bookRes
            found.push(item)
        } else {
            console.error('getLatestLangHelpsResourcesFromCatalog - Resource item not found', {languageId, owner, resourceId: resource.id})
            error = true
        }
    }

    for (const item of found) {
        const resourceId = item?.resourceId;
        // @ts-ignore
        const resourceName = RESOURCE_ID_MAP?.[resourceId]
        const languageId_ = item?.languageId;
        const version = item?.version;
        const owner_ = item?.owner;
        const expectedRepo = path.join(resourcesPath, languageId_, apiHelpers.TRANSLATION_HELPS, resourceName, `v${version}_${resourcesHelpers.encodeOwnerStr(owner_)}`)
        const files = getFilesOfType(expectedRepo, ".json");
        if (files?.length) {
            console.log('getLatestLangHelpsResourcesFromCatalog - already have', item)
            const resourceObject = {
                id: item?.resourceId,
                languageId: item?.languageId,
                path: expectedRepo
            }
            // @ts-ignore
            foundResources[item.resourceId] = resourceObject
        } else {
            console.log('getLatestLangHelpsResourcesFromCatalog - downloading', item)
            callback && await callback(`Starting Download of ${item.languageId}/${item.resourceId} ...`)
            const resource_ = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
            callback && await callback(`Downloaded ${item.languageId}/${item.resourceId}`)
            if (resource_) {
                processed.push(resource_)
                const resourcePath = resource_.resourcePath;
                const glLanguageId = resource_?.resource?.languageId;
                const resourceId = resource_?.resource?.resourceId;
                const resourceObject = {
                    id: resourceId,
                    languageId: glLanguageId,
                    path: resourcePath
                }
                // @ts-ignore
                foundResources[resource_.resource.resourceId] = resourceObject
                const ignoreIndex = resource_.resource.resourceId === 'tn'
                const success = await processHelpsIntoJson(item, resourcesPath, resourcePath, resource_.resourceFiles, resource_.byBook, ignoreIndex)
                if (!success) {
                    console.error('getLangHelpsResourcesFromCatalog - could not process', item)
                    error = true
                }
            } else {
                error = true
                // @ts-ignore
                console.error('getLatestLangHelpsResourcesFromCatalog - could not download Resource item', {
                    languageId,
                    owner,
                    resourceId: item.resourceId
                })
            }
        }
    }
    return {
        processed,
        updatedCatalogResources: catalog,
        foundResources,
        error
    }
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

function getLanguageForBible(languageId: string, bibleId: string) {
    let langId = languageId;
    if (bibleId === BooksOfTheBible.NT_ORIG_LANG_BIBLE) {
        langId = BooksOfTheBible.NT_ORIG_LANG;
    }
    else if (bibleId === BooksOfTheBible.OT_ORIG_LANG_BIBLE) {
        langId = BooksOfTheBible.OT_ORIG_LANG;
    }
    return langId;
}

function isOriginalBible(bibleId: string) {
    const isOriginal = bibleId === BooksOfTheBible.NT_ORIG_LANG_BIBLE || bibleId === BooksOfTheBible.OT_ORIG_LANG_BIBLE;
    return isOriginal;
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies and aligned bibles
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
export async function getLatestLangGlResourcesFromCatalog(catalog:null|any[], languageId:string, owner:string, resourcesPath:string, callback:Function|null = null) {
    const { processed, updatedCatalogResources, foundResources } = await downloadLatestLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath, callback)

    // @ts-ignore
    foundResources.bibles = []

    // get aligned bibles
    const alignedBiblesList = [['glt', 'ult'], ['gst', 'ust'], [BooksOfTheBible.NT_ORIG_LANG_BIBLE], [BooksOfTheBible.OT_ORIG_LANG_BIBLE]]
    for (const alignedBibles of alignedBiblesList) {
        let fetched = false
        for (const bibleId of alignedBibles) {
            const langId = getLanguageForBible(languageId, bibleId);
            const { languageId_, owner_ } = getLanguageAndOwnerForBible(langId, owner, bibleId)

            const foundPath = verifyHaveBibleResource(bibleId, resourcesPath, languageId_, owner_, catalog)
            if (foundPath) {
                fetched = true
                const bible = {
                    bibleId: bibleId,
                    languageId: languageId_,
                    owner: owner_,
                    path: foundPath
                };
                // if not original bibles add to list
                if (!isOriginalBible(bibleId)) {
                    // @ts-ignore
                    foundResources.bibles.push(bible)
                }
                // @ts-ignore
                foundResources[bibleId] = bible
                break
            }
        }

        if (!fetched) {
            for (const bibleId of alignedBibles) {
                const langId = getLanguageForBible(languageId, bibleId);
                const { languageId_, owner_ } = getLanguageAndOwnerForBible(langId, owner, bibleId)
                const item = findResource(updatedCatalogResources || [], languageId_, owner_, bibleId)
                if (item) {
                    console.log('getLangResourcesFromCatalog - downloading', item)
                    callback && await callback(`Starting Download of ${item.languageId}/${item.resourceId} ...`)
                    const resource = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
                    if (resource) {
                        processed.push(resource)
                        fetched = true
                        // @ts-ignore
                        foundResources[bibleId] = resource.resourcePath

                        if (!isOriginalBible(bibleId)) {
                            // @ts-ignore
                            foundResources.bibles.push({
                                id: bibleId,
                                path: resource.resourcePath
                            })
                        }
                    } else {
                        console.error('getLangResourcesFromCatalog - Resource item not downloaded', { languageId_, owner_, bibleId })
                    }
                    callback && await callback(`Downloaded ${item.languageId}/${item.resourceId}`)
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

    return { processed, updatedCatalogResources: catalog, foundResources }
}

export function getRepoPath(targetLanguageId:string, targetBibleId:string, glLanguageId:string, projectsPath = projectsBasePath) {
    return path.join(projectsPath, `${targetLanguageId}_${targetBibleId}_${glLanguageId}`)
}

/**
 * copy bible USFM files
 * @param repoPath
 */
function getBibleFiles(repoPath: string) {
    if (fs.pathExistsSync(repoPath)) {
        return fs.readdirSync(repoPath).filter((filename: string) => (path.extname(filename) === ".USFM") || (path.extname(filename) === ".usfm"));
    }
    return []
}

/**
 * get list of files with extension of fileType
 * @param repoPath
 * @param fileType
 */
function getFilesOfType(repoPath: string, fileType: string) {
    if (fs.pathExistsSync(repoPath)) {
        return fs.readdirSync(repoPath).filter((filename: string) => (path.extname(filename) === fileType));
    }
    return []
}

/**
 * copy files from one folder to destination
 * @param sourcePath
 * @param destPath
 * @param files
 */
function copyFiles(sourcePath: string, destPath: string, files: string[]) {
    try {
        fs.ensureDirSync(destPath)
        for (const file of files) {
            fs.copyFileSync(path.join(sourcePath, file), path.join(destPath, file))
        }
    } catch (e) {
        console.error(`copyFiles failed`, e)
        return false
    }
}

/**
 * replace the home path with '~'
 * @param filePath
 */
function removeHomePath(filePath:string) {
    if (filePath && (filePath.indexOf(ospath.home()) === 0)) {
        const newPath = filePath.replace(ospath.home(), '~')
        return newPath
    }
    return filePath
}

/**
 * replace leading ~ with home path
 * @param filePath
 */
function replaceHomePath(filePath:string) {
    if (filePath && (filePath.indexOf('~') === 0)) {
        const newPath = filePath.replace('~', ospath.home())
        return newPath
    }
    return filePath
}

export async function downloadTargetBible(targetBibleId: string, resourcesBasePath: string, targetLanguageId: string, targetOwner: string, repoPath: string, updatedCatalogResources: any[]) {
    let targetFoundPath = null;
    try {
        const foundPath = verifyHaveBibleResource(targetBibleId, resourcesBasePath, targetLanguageId, targetOwner, updatedCatalogResources, true);
        if (foundPath) {
            targetFoundPath = foundPath;
        } else {
            // if folder already exists, remove it first
            const folderPath = path.join(resourcesPath, targetLanguageId, "bibles", targetBibleId); // , `v${resource.version}_${resource.owner}`)
            const versionPath = resourcesHelpers.getLatestVersionInPath(folderPath, targetOwner, false);
            if (versionPath && fs.pathExistsSync(versionPath)) {
                fs.removeSync(versionPath);
            }

            const results = await fetchBibleResource(updatedCatalogResources, targetLanguageId, targetOwner, targetBibleId, resourcesBasePath);
            if (!results?.destFolder) {
                console.error(`downloadTargetBible - cannot copy target bible from: ${repoPath}`);
                targetFoundPath = null;
            } else {
                targetFoundPath = results.destFolder;
            }
        }
    } catch (e) {
        console.error(`downloadTargetBible - cannot copy target bible from: ${repoPath}`, e);
    }
    return targetFoundPath;
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
 * @param sourceResourceId - if null, then init both tn and twl
 */
export async function initProject(repoPath:string, targetLanguageId:string, targetOwner:string, targetBibleId:string, gl_languageId:string, gl_owner:string, resourcesBasePath:string, sourceResourceId:string|null, catalog:null|any[] = null, callback:Function|null = null) {
    let errorMsg
    const projectExists = fs.pathExistsSync(repoPath)
    const resourceIds = sourceResourceId ? [sourceResourceId] : ['twl', 'tn']
    let hasCheckingFiles = true
    for (const resourceId of resourceIds) {
        const checkingPath = path.join(repoPath, 'checking', resourceId)
        const checkingFiles = getFilesOfType(checkingPath, `.${resourceId}_check`)
        const hasCheckingFiles_ = checkingFiles?.length
        if (!hasCheckingFiles_) {
            hasCheckingFiles = false
        }
    }
    const bibleFiles = getBibleFiles(repoPath)
    const hasBibleFiles = bibleFiles?.length
    const shouldCreateProject = !projectExists
        || (hasBibleFiles && !hasCheckingFiles)

    if (!(gl_owner && gl_languageId)) {
        errorMsg = `Missing GL info`;
        console.error(`initProject - Missing GL info:`, { gl_owner, gl_languageId});
    } else
    if (shouldCreateProject) {
        const sourceTsvsPaths = {}
        try {
            const { processed, updatedCatalogResources, foundResources } = await getLatestLangGlResourcesFromCatalog(catalog, gl_languageId, gl_owner, resourcesBasePath, callback)
            if (updatedCatalogResources) {
                for (const resourceId of resourceIds) {
                    let sourceTsvsPath;
                    switch (resourceId) {
                        case "tn":
                        case "twl":
                            const resourceName = RESOURCE_ID_MAP[resourceId] || "";
                            const folderPath = path.join(resourcesBasePath, gl_languageId, "translationHelps", resourceName);
                            sourceTsvsPath = resourcesHelpers.getLatestVersionInPath(folderPath, gl_owner, false);
                            // @ts-ignore
                            sourceTsvsPaths[resourceId] = sourceTsvsPath
                            break;

                        default:
                            console.error(`initProject - Missing source project ID: ${gl_owner}/${gl_languageId}_${resourceId}`);
                            return {
                                success: false,
                                errorMsg: `Missing source project ID: ${gl_owner}/${gl_languageId}_${resourceId}`
                            };
                    }

                    if (sourceTsvsPath) {
                        const checkingPath = path.join(repoPath, 'checking', resourceId)
                        fs.ensureDirSync(checkingPath);
                        fs.copySync(sourceTsvsPath, checkingPath);

                        // create check files from json files
                        const files = getFilesOfType(checkingPath, ".json");
                        if (files?.length) {
                            for (const filename of files) {
                                const bookId = getBookIdFromPath(filename);
                                const newName = `${bookId}.${resourceId}_check`;
                                if (newName !== filename) {
                                    fs.moveSync(path.join(checkingPath, filename), path.join(checkingPath, newName));
                                }
                            }
                        }
                    }
                }

                if (!hasBibleFiles) {
                    callback && await callback(`Verifying Target Bible ${targetLanguageId}/${targetBibleId}`)
                    const targetFoundPath = await downloadTargetBible(targetBibleId, resourcesBasePath, targetLanguageId, targetOwner, repoPath, updatedCatalogResources);
                    if (!targetFoundPath) {
                        return {
                            success: false,
                            errorMsg: `cannot copy target bible from: ${repoPath}`,
                        };
                    } else {
                        fs.copySync(targetFoundPath, repoPath)
                    }
                    callback && await callback(`Downloaded Target Bible ${targetLanguageId}/${targetBibleId}`)
                }
                
                // replace home path with ~
                for (const resourceId of Object.keys(foundResources)) {
                    if (resourceId === 'bibles') {
                        // @ts-ignore
                        const bibles:string[] = foundResources[resourceId]
                        for (let i = 0; i < bibles.length; i++) {
                            // @ts-ignore
                            const bible = bibles[i]
                            // @ts-ignore
                            if (bible?.path) {
                                // @ts-ignore
                                const newPath = removeHomePath(bible.path)
                                // @ts-ignore
                                bible.path = newPath
                            }
                        }
                    } else {
                        // @ts-ignore
                        const resource = foundResources[resourceId]
                        let path_ = resource?.path;
                        if (path_) {
                            // @ts-ignore
                            const newPath = removeHomePath(path_)
                            // @ts-ignore
                            resource.path = newPath
                        }
                    }
                }
                    
                // create metadata
                const checkingMetaData = {
                    resourceType: "Translation Checker",
                    targetLanguageId,
                    gatewayLanguageId: gl_languageId,
                    gatewayLanguageOwner: gl_owner,
                    resourcesBasePath: removeHomePath(resourcesBasePath),
                    otherResources: foundResources,
                };
                const metadata = {
                    [checkingName]: checkingMetaData
                }
                for (const resourceId of resourceIds) {
                    const checkingPathName = `${resourceId}_checksPath`
                    // @ts-ignore
                    checkingMetaData[checkingPathName] = `./checking/${resourceId}`
                    const tsvSourcePathName = `${resourceId}_helpsPath`
                    // @ts-ignore
                    checkingMetaData[tsvSourcePathName] = removeHomePath(sourceTsvsPaths[resourceId])
                }
                
                const outputPath = path.join(repoPath, `metadata.json`)
                fs.outputJsonSync(outputPath, metadata, { spaces: 2 })
            }
            return {
                success: true,
                errorMsg: ''
            };
        } catch (e) {
            console.error(`initProject - error creating project: ${repoPath}`, e)
            errorMsg = `error creating project: ${repoPath}`;
        }
    } else {
        console.error(`initProject - cannot initialize folder because it already exists: ${repoPath}`)
        errorMsg = `cannot initialize folder because it already exists: ${repoPath}`;
    }

    return {
        success: false,
        errorMsg
    };

}

function readJsonFileIfExists(jsonPath:string) {
    if (fs.existsSync(jsonPath)) {
        const data = fs.readJsonSync(jsonPath)
        return data
    }
    return null
}

export function saveCatalog(catalog:object) {
    fs.ensureDirSync(resourcesPath)
    fs.outputJsonSync(updatedResourcesPath, catalog)
}

export function getSavedCatalog():null|object[] {
    const fileExists = fs.existsSync(updatedResourcesPath);
    const updatedResources = fileExists ? fs.readJsonSync(updatedResourcesPath) : null
    return updatedResources
}

export function fileExists(filePath:string) {
    return !!fs.existsSync(filePath)
}

/**
 * make sure repo is initialized for checking
 * @param repoPath
 * @param resourcesBasePath
 * @param sourceResourceId - if null, then check both tn and twl
 */
export function isRepoInitialized(repoPath:string, resourcesBasePath:string, sourceResourceId:string|null) {
    const resourceIds = sourceResourceId ? [sourceResourceId] : ['twl', 'tn']
    let error = false
    let manifest = null
    let repoExists = false
    let metaDataInitialized = false
    let checksInitialized = false
    let translationHelpsLoaded = false
    let bibleBooksLoaded = false
    try {
        repoExists = fs.existsSync(repoPath);
        const pathToMetaData = path.join(repoPath, 'metadata.json')
        const metaDataExists = fs.existsSync(pathToMetaData);
        const metadata = metaDataExists ? fs.readJsonSync(pathToMetaData) : null
        if (!repoExists) {
            console.log(`isRepoInitialized - repo does not exist at ${repoPath}`)
        } else if (metadata) {
            const checkingMetadata = metadata[checkingName]
            for (const resourceId of resourceIds) {
                const resourcePathKey = `${resourceId}_checksPath`;
                if (checkingMetadata?.[resourcePathKey]) { // metadata initialized for resourceId
                    metaDataInitialized = true
                    const checkingPath = path.join(repoPath, checkingMetadata[resourcePathKey])
                    const checkingFiles = getFilesOfType(checkingPath, `.${resourceId}_check`)
                    checksInitialized = !!checkingFiles?.length
                    if (!checksInitialized) {
                        console.log(`isRepoInitialized - checks not present at ${checkingPath}`)
                        break
                    }
                    const helpsPathKey = `${resourceId}_helpsPath`;
                    if (checkingMetadata?.[helpsPathKey]) {
                        const helpsPath = replaceHomePath(checkingMetadata[helpsPathKey])
                        const helpsFiles = getFilesOfType(helpsPath, `.json`)
                        translationHelpsLoaded = !!helpsFiles?.length
                        if (!translationHelpsLoaded) {
                            console.log(`isRepoInitialized - translationHelps not present at ${helpsPath}`)
                            break
                        }
                    } else {
                        console.log(`isRepoInitialized - metadata.json does not contain key ${helpsPathKey}:`, metadata)
                        break
                    }
                } else {
                    console.log(`isRepoInitialized - metadata.json does not contain key ${resourcePathKey}:`, metadata)
                    break
                }
            }
        } else {
            console.log(`isRepoInitialized - metadata.json does not exist at ${metaDataExists}, try manifest`)
        }
        
        manifest = getResourceManifest(repoPath)
        const bibleBooks = getBibleFiles(repoPath)
        bibleBooksLoaded = !!bibleBooks?.length
    } catch (e) {
        console.error(`isRepoInitialized - error checking repo`, e)
        error = true
    }

    return {
        error,
        repoExists,
        metaDataInitialized,
        checksInitialized,
        translationHelpsLoaded,
        bibleBooksLoaded,
        manifest
    }
}

/**
 * make sure resource has content has data other than manifest
 * @param resource
 */
function hasResourceData(resource:object) {
    if (resource) {
        // @ts-ignore
        const minCount = resource?.manifest ? 2 : 1;
        // @ts-ignore
        let hasResourceFiles = Object.keys(resource).length >= minCount; // need more that just manifest
        return hasResourceFiles;
    }
    return false
}

function getCheckingResource(repoPath: string, metadata: object, resourceId: string, bookId: string) {
    // @ts-ignore
    const checksPath = path.join(repoPath, metadata[`${resourceId}_checksPath`]);
    const checkType = `.${resourceId}_check`;
    const twlPath = path.join(checksPath, `${bookId}${checkType}`);
    let resource = readJsonFileIfExists(twlPath);
    let hasResourceFiles = hasResourceData(resource);
    if (!hasResourceFiles) { // if we don't have checking the specific book, check to see if we have checks for other books at least
        const files = getFilesOfType(checksPath, checkType);
        hasResourceFiles = !!files.length;
        resource = {}
    }
    return { resource, hasResourceFiles };
}

/**
 * load all the resources needed for checking
 * @param repoPath
 */
export function getResourcesForChecking(repoPath:string, resourcesBasePath:string, resourceId:string, bookId:string) {
  let missing = ''
  try {
    const pathToMetaData = path.join(repoPath, 'metadata.json')
    const metaDataExists = fs.existsSync(pathToMetaData);
    const results = {}

    if (metaDataExists) {
      let metadata = fs.readJsonSync(pathToMetaData);
      metadata = metadata[checkingName]
      if (metadata) {
          // @ts-ignore
          results.lexicons = lexicons
          // @ts-ignore
          results.locales = locales
          if (resourceId === 'twl') {
              let { resource, hasResourceFiles } = getCheckingResource(repoPath, metadata, resourceId, bookId);
              // @ts-ignore
              results.twl = resource
              // @ts-ignore
              results.hasTwls = !! hasResourceFiles
              const twResource = metadata.otherResources['tw']
              let twPath = replaceHomePath(twResource?.path)
              twPath = twPath && path.join(twPath, 'tw.json')
              // @ts-ignore
              results.tw = twPath && readJsonFileIfExists(twPath)
          } else
          if (resourceId === 'tn') {
              let { resource, hasResourceFiles } = getCheckingResource(repoPath, metadata, resourceId, bookId);
              const tnPath = path.join(repoPath, metadata[`${resourceId}_checksPath`], `${bookId}.${resourceId}_check` )
              // @ts-ignore
              results.tn = resource
              // @ts-ignore
              results.hasTns = !! hasResourceFiles
              // @ts-ignore
              results.tn = readJsonFileIfExists(tnPath)
              const taResource = metadata.otherResources['ta']
              let taPath = replaceHomePath(taResource?.path)
              taPath = taPath && path.join(taPath, 'ta.json')
              // @ts-ignore
              results.ta = taPath && readJsonFileIfExists(taPath)
          }

          // @ts-ignore
          results.project = {
              bookId,
              languageId: metadata.targetLanguageId,
              resourceId,
          }
          
          const biblesList = metadata.otherResources.bibles
          const bibles = []
          const isNT = BooksOfTheBible.isNT(bookId)
          const origLangguageId = isNT ? BooksOfTheBible.NT_ORIG_LANG : BooksOfTheBible.OT_ORIG_LANG
          const origLangguageBibleId = isNT ? BooksOfTheBible.NT_ORIG_LANG_BIBLE : BooksOfTheBible.OT_ORIG_LANG_BIBLE
          const origLangBible = {
              languageId: origLangguageId,
              id: origLangguageBibleId,
              owner: 'unfoldingWord'
          }
          biblesList.unshift(origLangBible); // insert into first position
          let book;

          for (const bible of biblesList) {
              const bibleId = bible.bibleId || bible.id
              if (bible.path) {
                  const biblePath = replaceHomePath(bible.path)
                  book = getBookOfTheBibleFromFolder(biblePath, bookId)
              } else {
                  book = getBookOfTheBible(resourcesBasePath, bookId, bibleId, bible.languageId, bible.owner);

              }

              if (book) {
                  const manifest = book?.manifest;
                  const dublin_core = manifest?.dublin_core;
                  const languageId = manifest?.language_id || dublin_core?.language?.identifier || bible?.languageId;
                  const _bibleId = bibleId || manifest?.resource_id || dublin_core?.identifier;
                  const bibleObject = {
                      book,
                      languageId: languageId,
                      bibleId: _bibleId,
                      owner: bible.owner,
                  };

                  if (!bible.owner) {// try to get info from folder name
                      const parts = path.basename(bible.path || "").split("_");
                      if (parts?.length === 2) {
                          // @ts-ignore
                          bibleObject.version = parts[0];
                          bibleObject.owner = parts[1];
                      }
                  }
                  bibles.push(bibleObject);
                  // @ts-ignore
                  results[_bibleId] = bibleObject;
              }
          }

          // @ts-ignore
          results.bibles = bibles
          // @ts-ignore
          results.targetBible = getBookOfTheBibleFromFolder(repoPath, bookId)
          // add target bible to start of bibles list
          const targetBible = {
              // @ts-ignore
              book: results.targetBible,
              languageId: 'targetLanguage',
              bibleId: 'targetBible',
              owner: 'unfoldingWord'
          }
          bibles.unshift(targetBible)

          // @ts-ignore
          results.isNt = BooksOfTheBible.isNT(bookId)
          // @ts-ignore
          results.origBibleId = results.isNt ? BooksOfTheBible.NT_ORIG_LANG_BIBLE : BooksOfTheBible.OT_ORIG_LANG_BIBLE
          const { success: validResources, error } = haveNeededResources(results)
          // @ts-ignore
          results.validResources = validResources 
          if (!validResources) {
              missing = `needed resources missing: ${error}`
              // @ts-ignore
              results.errorMessage = missing
              console.error(`getResourcesForChecking (${repoPath}) - needed resources missing`)
          }
          else {
              // @ts-ignore
              results.success = true
          }
          return results
      }
    }
  } catch (error) {
    console.error(`getResourcesForChecking (${repoPath}) - exception getting metadata`, error);
    missing = `exception getting metadata or resources: ${error}`
  }
  return { 
      errorMessage: missing,
      success: false
  }
}

/**
 * make sure that we have the necessary resources to show checking tool
 * @param resources
 */
export function haveNeededResources(resources:object) {
    function generateError(message: string) {
        console.warn(`haveNeededData - ${message}`);
        return {
            success: false,
            error: message
        }
    }

    if (resources) {
        // @ts-ignore
        const project = resources.project;
        const resourceId = project?.resourceId;
        const bookId = project?.bookId;
        if (!(bookId && project?.languageId && resourceId)) {
            return generateError(`missing project data`);
        }
        // @ts-ignore
        if (!(resources?.lexicons)) {
            return generateError(`missing lexicon data`);
        }
        // @ts-ignore
        if (!(resources?.locales)) {
            return generateError(`missing locales data`);
        }
        
        if (resourceId === 'twl') {
            // @ts-ignore
            if (!(resources?.hasTwls)) {
                return generateError(`missing GL twl data`);
            }
            // @ts-ignore
            if (!(resources?.tw)) {
                return generateError(`missing GL tw data`);
            }
        } else if (resourceId === 'tn') {
            // @ts-ignore
            if (!(resources?.hasTns)) {
                return generateError(`missing GL tn data`);
            }
            // @ts-ignore
            if (!(resources?.ta)) {
                return generateError(`missing GL ta data`);
            }
        } else {
            return generateError(`unsupported resourceId ${resourceId}`);
        }

        // @ts-ignore
        let bibles = resources?.bibles;
        if (!(bibles?.length > 1)) {
            return generateError(`should have at least two bibles but only have ${bibles?.length}`);
        }
        
        for (const bible of bibles) {
            if (!bible?.bibleId) {
                return generateError(`missing bibleId for bible ${bible?.owner}/${bible?.languageId}`);
            }

            if (!bible?.languageId) {
                return generateError(` missing languageId for bible ${bible?.owner}/${bible?.bibleId}`);
            }

            // if (!bible?.owner) {
            //     console.warn(`haveNeededData - missing owner for bible`, bible)
            //     return false
            // }

            if (!bible?.book) {
                return generateError(` missing bible data for bible ${bible?.owner}/${bible?.languageId}/${bible?.bibleId}`);
            } else if (!bible?.book?.manifest) {
                return generateError(`missing bible manifest ${bible?.owner}/${bible?.languageId}/${bible?.bibleId}`);
            }

        }

        // @ts-ignore
        if (!resources?.targetBible) {
            return generateError(`missing targetBible`);
        } else
        // @ts-ignore
        if (!resources?.targetBible?.manifest) {
            return generateError(`missing targetBible manifest`);
        }
        // @ts-ignore
        if (!(resources?.glt || resources?.ult)) {
            return generateError(`missing aligned literal translation`);
        }
        // @ts-ignore
        const haveOriginalLangBible = resources?.[resources.origBibleId]
        if (!haveOriginalLangBible) {
            // @ts-ignore
            return generateError(`missing aligned original language bible ${resources?.origBibleId}`);
        }
    }
    return {
        success: true,
        error: ''
    }
}

/**
 * @description Parses the usfm file using usfm-parse library.
 * @param {string} usfmData - USFM data to parse
 */
export function getParsedUSFM(usfmData:string) {
    try {
        if (usfmData) {
            return usfmjs.toJSON(usfmData, { convertToInt: ['occurrence', 'occurrences'] });
        }
    } catch (e) {
        console.error(e);
    }
}

function generateDefaultManifest() {
    return {
        language_id: "unknown",
        language_name: "unknown",
        direction: "ltor",
        subject: "Bible",
        resource_id: "unknown",
        resource_title: "unknown Bible",
        description: "unknown Bible",
    };
}

/**
 * @description - Turns a manifest.json file into an object and returns it, null if doesn't exist
 * @param {string} resourcePath - folder for manifest.json
 * @return {Object} manifest
 */
export function getResourceManifest(resourcePath:string):object|null {
    let manifest = null;
    let fileName = 'manifest.json';
    let manifestPath = path.join(resourcePath, fileName);
    if (fs.existsSync(manifestPath)) {
        try {
            manifest = fs.readJsonSync(manifestPath);
        } catch (e) {
            console.log(`getResourceManifest - manifest load failed ${manifestPath}`)
        }
    } else {
        fileName = 'manifest.yaml';
        manifestPath = path.join(resourcePath, fileName);
        if (fs.existsSync(manifestPath)) {
            try {
                let manifestYaml = fs.readFileSync(manifestPath, 'utf8');
                if (manifestYaml) {
                    let dublinCore
                    try {
                        manifest = YAML.parse(manifestYaml)
                        // copy some data for more convenient access
                        dublinCore = manifest?.dublin_core;
                    } catch (e) {
                        console.error(`getResourceManifest - manifest.yaml invalid ${manifestPath}`, e)
                        manifestYaml = manifestYaml.replace('---', '').trimStart()
                        try {
                            manifest = YAML.parse(manifestYaml)
                            // copy some data for more convenient access
                            dublinCore = manifest?.dublin_core;
                            console.log(`getResourceManifest - manifest.yaml cleaned yaml worked`)
                        } catch (e) {
                            console.error(`getResourceManifest - manifest.yaml invalid even without --- ${manifestPath}`, e)
                        }
                    }
                    
                    if (manifest && dublinCore) {
                        manifest.language_id = dublinCore.language.identifier;
                        manifest.language_name = dublinCore.language.title;
                        manifest.direction = dublinCore.language.direction;
                        manifest.subject = dublinCore.subject;
                        manifest.resource_id = dublinCore.identifier;
                        manifest.resource_title = dublinCore.title;
                        const oldMainfestIdentifier = dublinCore.identifier.toLowerCase();
                        const identifiers = ["ugnt", "ubh"];
                        manifest.description = identifiers.includes(oldMainfestIdentifier) ?
                          "Original Language" : "Gateway Language";
                    } else {
                        console.log(`getResourceManifest - falling back to default manifest`)
                        manifest = generateDefaultManifest()
                    }
                }
            } catch (e) {
                console.log(`getResourceManifest - manifest load failed ${manifestPath}`, e)
            }
        }
        else {
            console.log(`getResourceManifest - falling back to default manifest`)
            manifest = generateDefaultManifest()
        }
    }
    return manifest;
}

/**
 * read bible book from file system at biblePath
 * @param biblePath
 * @param bookId
 */
export function getBookOfTheBibleFromFolder(biblePath:string, bookId:string) {
    try {
        if (fs.existsSync(biblePath)) {
            const manifest = getResourceManifest(biblePath)
            if (manifest) {
                const books = getBibleFiles(biblePath)
                let bookPath = path.join(biblePath, bookId);
                if (fs.existsSync(bookPath)) {
                    const bookData = readHelpsFolder(bookPath)
                    // @ts-ignore
                    bookData.manifest = manifest
                    return bookData
                } else {
                    for (const book of books) {
                        const matchLowerCase = book.toLowerCase()
                        if (matchLowerCase.includes(bookId)) {
                            const usfm = fs.readFileSync(path.join(biblePath, book), 'utf8');
                            const json = getParsedUSFM(usfm)
                            const bookData = json.chapters;
                            bookData.manifest = manifest
                            return bookData
                        }
                    }
                }
                if (books.length) {
                    // book not found, but the bible has files
                    return {
                        manifest,
                    };
                }
            }
        }
        console.warn(`getBookOfTheBibleFromFolder(${biblePath}, ${bookId}) - missing`)
    } catch (e) {
        console.error(`getBookOfTheBibleFromFolder(${biblePath}, ${bookId}) - failed`, e)
    }
    return null
}

/**
 * read bible book from file system at resourcesPath
 * @param resourcesPath
 * @param bookId
 * @param bibleId
 * @param languageId
 * @param owner
 */
export function getBookOfTheBible(resourcesPath:string, bookId:string, bibleId:string, languageId:string, owner:string) {
    const folderPath = path.join(resourcesPath, languageId, 'bibles', bibleId) // , `v${resource.version}_${resource.owner}`)
    const versionPath = resourcesHelpers.getLatestVersionInPath(folderPath, owner, false)
    const book = getBookOfTheBibleFromFolder(versionPath, bookId)
    return book
}

/**
 * extract the bookId from the file path
 * @param filePath - like tn_<bookId>.tn_check
 */
export function getBookIdFromPath(filePath:string):null|string {
    if (typeof filePath === 'string') {
        const parsed = path.parse(filePath);
        if (parsed?.name) {
            const nameLower = parsed.name.toLowerCase();
            const parts = nameLower.split("_");
            for (const bookId of parts) { // check each part for a match
                if (bookId) {
                    // @ts-ignore
                    const found = BooksOfTheBible.ALL_BIBLE_BOOKS[bookId]
                    if (found) {
                        return bookId;
                    }
                }
            }
        }
    }
    console.error(`getBookIdFromPath() - illegal path ${filePath}`)
    return null
}

/**
 * extract the projectId from the file path
 * @param filePath - like tn_1jn.<projectId>_check
 */
export function getProjectIdFromPath(filePath:string):null|string {
    const match = ['tn', 'twl']
    if (typeof filePath === 'string') {
        const parsed = path.parse(filePath);
        if (parsed?.ext) {
            const extensionLower = parsed.ext.substring(1).toLowerCase();
            const parts = extensionLower.split("_");
            for (const projectId of parts) { // check each part for a match
                if (projectId) {
                    // @ts-ignore
                    const found = match.includes(projectId)
                    if (found) {
                        return projectId;
                    }
                }
            }
        }
    }
    console.error(`getBookIdFromPath() - illegal path ${filePath}`)
    return null
}

/**
 * fetches all the resources for doing checking.
 * @param filePath path to the file.
 * @param resourcesBasePath - base path for resources
 * @returns A resource collection object.
 */
export function loadResourcesFromPath(filePath: string, resourcesBasePath:string):ResourcesObject | null {
    // console.log(`loadResourcesFromPath() - filePath: ${filePath}`);
    const bookId = getBookIdFromPath(filePath)
    const projectId = getProjectIdFromPath(filePath)
    if (bookId && projectId) {
        const repoPath = path.join(path.dirname(filePath), '../..')
        const resources = getResourcesForChecking(repoPath, resourcesBasePath, projectId, bookId)
        return resources
    }
    return null
}

/**
 * wraps timer in a Promise to make an async function that continues after a specific number of milliseconds.
 * @param {number} ms
 * @returns {Promise<unknown>}
 */
export function delay(ms:number) {
    return new Promise((resolve) =>
      setTimeout(resolve, ms)
    );
}

export function getBookForTestament(repoPath: string, isNT = true):string | null {
    // console.log(`loadResourcesFromPath() - filePath: ${filePath}`);
    const testamentBooks = Object.keys(isNT ? BIBLE_BOOKS.newTestament : BIBLE_BOOKS.oldTestament)
    const files = getBibleFiles(repoPath)
    for (const file of files) {
        const name = path.parse(file).name || ''
        for (const bookId of testamentBooks) {
            if (name.toLowerCase().includes(bookId)) {
                return bookId
            }
        }
    }
    return null
}

export function cleanUpFailedCheck(repoPath:string) {
    const CHECKING_NAME = 'checking';
    const METADATA_NAME = 'metadata.json';
    
    const checkingPath = path.join(repoPath, CHECKING_NAME);
    const metadataPath = path.join(repoPath, METADATA_NAME);
    const failedPath = path.join(repoPath, 'FAILED')
    
    const hasChecks = fs.existsSync(checkingPath)
    const hasMetadata = fs.existsSync(metadataPath)
    if (hasChecks || hasMetadata) {
        try {
            if (fs.existsSync(failedPath)) {
                fs.removeSync(failedPath)
            }
            fs.ensureDirSync(failedPath)
            if (hasChecks) {
                fs.moveSync(checkingPath, path.join(failedPath, CHECKING_NAME))
            }
            if (hasMetadata) {
                fs.moveSync(metadataPath, path.join(failedPath,METADATA_NAME))
            }
        } catch(e) {
            console.warn(`cleanUpFailedCheck - failed ${repoPath}`, e)
        }
    }
}