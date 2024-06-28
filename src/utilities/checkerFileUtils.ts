// @ts-ignore
import * as fs from 'fs-extra';
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
// @ts-ignore
import * as usfmjs from "usfm-js";
import { readHelpsFolder } from "./folderUtils";
import * as BooksOfTheBible from "./BooksOfTheBible";
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

const lexicons = require('../data/lexicons.json')
const locales = require('../data/locales/English-en_US.json')

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
        const folderPath = path.join(resourcesPath, resource.languageId, 'translationHelps', resourceName, `v${resource.version}_${resourcesHelpers.encodeOwnerStr(resource.owner)}`)
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
async function getLatestLangHelpsResourcesFromCatalog(catalog:null|any[], languageId:string, owner:string, resourcesPath:string) {
    if (!catalog?.length) {
        catalog = await getLatestResources(resourcesPath)
    }

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
            console.error('getLangHelpsResourcesFromCatalog - Resource item not found', {languageId, owner, resourceId: resource.id})
        }
    }

    for (const item of found) {
        console.log('getLangHelpsResourcesFromCatalog - downloading', item)
        const resource_ = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
        if (resource_) {
            processed.push(resource_)
            const resourceObject = {
                id: resource_?.resource?.resourceId,
                languageId: resource_?.resource?.languageId,
                path: resource_.resourcePath
            }
            // @ts-ignore
            foundResources[resource_.resource.resourceId] = resourceObject
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
    return {
        processed,
        updatedCatalogResources: catalog,
        foundResources,
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

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies and aligned bibles
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
export async function getLatestLangGlResourcesFromCatalog(catalog:null|any[], languageId:string, owner:string, resourcesPath:string) {
    const { processed, updatedCatalogResources, foundResources } = await getLatestLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath)

    // @ts-ignore
    foundResources.bibles = []

    // get aligned bibles
    const alignedBiblesList = [['glt', 'ult'], ['gst', 'ust']]
    for (const alignedBibles of alignedBiblesList) {
        let fetched = false
        for (const bibleId of alignedBibles) {
            const { languageId_, owner_ } = getLanguageAndOwnerForBible(languageId, owner, bibleId)

            const foundPath = verifyHaveBibleResource(bibleId, resourcesPath, languageId_, owner_, catalog)
            if (foundPath) {
                fetched = true
                const bible = {
                    bibleId: bibleId,
                    languageId: languageId_,
                    owner: owner_,
                    path: foundPath
                };
                // @ts-ignore
                foundResources.bibles.push(bible)
                // @ts-ignore
                foundResources[bibleId] = bible
                break
            }
        }

        if (!fetched) {
            for (const bibleId of alignedBibles) {
                const { languageId_, owner_ } = getLanguageAndOwnerForBible(languageId, owner, bibleId)
                const item = findResource(updatedCatalogResources || [], languageId_, owner_, bibleId)
                if (item) {
                    console.log('getLangResourcesFromCatalog - downloading', item)
                    const resource = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false)
                    if (resource) {
                        processed.push(resource)
                        fetched = true
                        // @ts-ignore
                        foundResources[bibleId] = resource.resourcePath
                        // @ts-ignore
                        foundResources.bibles.push({
                            id: bibleId,
                            path: resource.resourcePath
                        })
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

    return { processed, updatedCatalogResources: catalog, foundResources }
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
export async function initProject(repoPath:string, targetLanguageId:string, targetOwner:string, targetBibleId:string, gl_languageId:string, gl_owner:string, resourcesBasePath:string, sourceResourceId:string, catalog:null|any[] = null) {
    const projectExists = fs.pathExistsSync(repoPath)
    const checkingPath = path.join(repoPath, 'checking', sourceResourceId)
    const checkingFiles = getFilesOfType(checkingPath, `.${sourceResourceId}_check`)
    const hasCheckingFiles = checkingFiles?.length
    const bibleFiles = getBibleFiles(repoPath)
    const hasBibleFiles = bibleFiles?.length
    const shouldCreateProject = !projectExists
        || (hasBibleFiles && !hasCheckingFiles)

    if (shouldCreateProject) {
        try {
            const { processed, updatedCatalogResources, foundResources } = await getLatestLangGlResourcesFromCatalog(catalog, gl_languageId, gl_owner, resourcesBasePath)
            if (updatedCatalogResources) {
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

                // more checks per book
                fs.ensureDirSync(checkingPath)
                fs.copySync(sourceTsvsPath, checkingPath)

                // create check files from json files
                const files = getFilesOfType(checkingPath, '.json')
                if (files?.length) {
                    for (const filename of files) {
                        let newName = filename.replace('.json', `.${sourceResourceId}_check`)
                        if (newName !== filename) {
                            fs.moveSync(path.join(checkingPath, filename), path.join(checkingPath, newName))
                        }
                    }
                }

                const foundPath = verifyHaveBibleResource(targetBibleId, resourcesBasePath, targetLanguageId, targetOwner, catalog, true)
                if (foundPath) {
                    fs.copySync(foundPath, repoPath)
                } else {
                    const results = await fetchBibleResource(updatedCatalogResources, targetLanguageId, targetOwner, targetBibleId, resourcesBasePath)
                    if (!results.destFolder) {
                        console.error(`initProject - cannot copy target bible: ${repoPath}`)
                        return false
                    }
                    fs.copySync(results.destFolder, repoPath)
                }
                
                const checkingPathName = `${sourceResourceId}_path`
                
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
                const metadata = {
                    [checkingName]: {
                        resourceType: "Translation Checker",
                        [checkingPathName]: `./checking/${sourceResourceId}`,
                        targetLanguageId,
                        gatewayLanguageId: gl_languageId,
                        gatewayLanguageOwner: gl_owner,
                        resourcesBasePath: removeHomePath(resourcesBasePath),
                        sourceTsvsPath: removeHomePath(sourceTsvsPath),
                        checkingPath: removeHomePath(checkingPath),
                        otherResources: foundResources,
                    }
                }
                const outputPath = path.join(repoPath, `metadata.json`)
                fs.outputJsonSync(outputPath, metadata, { spaces: 2 })
            }
            return true
        } catch (e) {
            console.error(`initProject - error creating project: ${repoPath}`)
        }
    } else {
        console.error(`initProject - cannot initialize folder because it already exists: ${repoPath}`)
    }
    return false
}

function readJsonFileIfExists(jsonPath:string) {
    if (fs.existsSync(jsonPath)) {
        const data = fs.readJsonSync(jsonPath)
        return data
    }
    return null
}
/**
 * 
 * @param repoPath
 */
export function getResourcesForChecking(repoPath:string, resourcesBasePath:string, resourceId:string, bookId:string) {
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
              const twlPath = path.join(repoPath, metadata[`${resourceId}_path`], `${resourceId}_${bookId}.${resourceId}_check` )
              // @ts-ignore
              results.twl = readJsonFileIfExists(twlPath)
              const twResource = metadata.otherResources['tw']
              let twPath = replaceHomePath(twResource?.path)
              twPath = path.join(twPath, 'tw.json')
              // @ts-ignore
              results.tw = readJsonFileIfExists(twPath)
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
          const origLangguageId = isNT ? BooksOfTheBible.NT_ORIG_LANG : BooksOfTheBible.NT_ORIG_LANG
          const origLangguageBibleId = isNT ? BooksOfTheBible.NT_ORIG_LANG_BIBLE : BooksOfTheBible.OT_ORIG_LANG_BIBLE
          const origLangBible = {
              languageId: origLangguageId,
              bibleId: origLangguageBibleId,
              owner: 'unfoldingWord'
          }
          biblesList.splice(1, 0, origLangBible); // insert into second position
          let book;

          for (const bible of biblesList) {
              if (bible.path) {
                  const biblePath = replaceHomePath(bible.path)
                  book = getBookOfTheBibleFromFolder(biblePath, bookId)
              } else {
                  book = getBookOfTheBible(resourcesBasePath, bookId, bible.bibleId, bible.languageId, bible.owner);
              }

              const bibleObject = {
                  book,
                  languageId: bible.languageId,
                  bibleId: bible.bibleId,
                  owner: bible.owner
              };
              bibles.push(bibleObject)
              // @ts-ignore
              results[bible.bibleId] = bibleObject
          }

          // @ts-ignore
          results.bibles = bibles
          // @ts-ignore
          results.targetBible = getBookOfTheBibleFromFolder(repoPath, bookId)
          const validResources = haveNeededResources(results)
          // @ts-ignore
          results.validResources = validResources 
          if (!validResources) {
              console.error(`getResourcesForChecking (${repoPath}) - needed resources missing`)
          }
          return results
      }
    }
  } catch (error) {
    console.error(`getResourcesForChecking (${repoPath}) - error getting metadata`, error);
  }
  return null
}

/**
 * make sure that we have the necessary resources to show checking tool
 * @param resources
 */
export function haveNeededResources(resources:object) {
    if (resources) {
        // @ts-ignore
        const project = resources.project;
        const resourceId = project?.resourceId;
        const bookId = project?.bookId;
        const isNt = BooksOfTheBible.isNT(bookId)
        if (!(bookId && project?.languageId && resourceId)) {
            console.warn(`haveNeededData - missing project data`)
            return false
        }
        // @ts-ignore
        if (!(resources?.lexicons)) {
            console.warn(`haveNeededData - missing lexicon data`)
            return false
        }
        // @ts-ignore
        if (!(resources?.locales)) {
            console.warn(`haveNeededData - missing locales data`)
            return false
        }
        
        if (resourceId === 'twl') {
            // @ts-ignore
            if (!(resources?.twl)) {
                console.warn(`haveNeededData - missing gl twl data`);
                return false;
            }
            // @ts-ignore
            if (!(resources?.tw)) {
                console.warn(`haveNeededData - missing gl tw data`);
                return false;
            }
        } else {
            console.warn(`haveNeededData - unsupported resourceId ${resourceId}`);
            return false;
        }

        // @ts-ignore
        let bibles = resources?.bibles;
        if (!(bibles?.length > 1)) {
            console.warn(`haveNeededData - missing bibles should at least be two but only have ${bibles?.length}`)
            return false
        }
        // @ts-ignore
        if (!resources?.targetBible) {
            console.warn(`haveNeededData - missing targetBible`)
            return false
        }
        // @ts-ignore
        if (!(resources?.glt || resources?.ult)) {
            console.warn(`haveNeededData - missing aligned literal translation`)
            return false
        }
        // @ts-ignore
        const haveOriginalLang = isNt ? resources?.ugnt : resources?.hbo
        if (!haveOriginalLang) {
            console.warn(`haveNeededData - missing aligned original language bible`)
            return false
        }
    }
    return true
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

/**
 * read bible book from file system at biblePath
 * @param biblePath
 * @param bookId
 */
export function getBookOfTheBibleFromFolder(biblePath:string, bookId:string) {
    try {
        if (fs.existsSync(biblePath)) {
            let bookPath = path.join(biblePath, bookId);
            if (fs.existsSync(bookPath)) {
                const bookData = readHelpsFolder(bookPath)
                return bookData
            } else {
                const books = getBibleFiles(biblePath)
                for (const book of books) {
                    const matchLowerCase = book.toLowerCase()
                    if (matchLowerCase.includes(bookId)) {
                        const usfm = fs.readFileSync(path.join(biblePath, book), 'utf8');
                        const json = getParsedUSFM(usfm)
                        return json.chapters
                    }
                }
            }
        }
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
