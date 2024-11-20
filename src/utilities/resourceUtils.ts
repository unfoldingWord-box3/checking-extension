// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
// @ts-ignore
import * as ospath from "ospath";
// @ts-ignore
import * as usfmjs from "usfm-js";
// @ts-ignore
import * as YAML from "yamljs";
import {
    delay,
    getFilesOfType,
    objectNotEmpty,
    readHelpsFolder,
    readJsonFile,
} from "./fileUtils";
import * as BooksOfTheBible from "./BooksOfTheBible";
import {
    ALL_BIBLE_BOOKS,
    BIBLE_BOOKS,
    isNT,
    NT_ORIG_LANG,
    NT_ORIG_LANG_BIBLE,
    OT_ORIG_LANG,
    OT_ORIG_LANG_BIBLE,
} from "./BooksOfTheBible";
import { GeneralObject, ResourcesObject } from "../../types";
import {
    getCurrentLocale,
    getLanguage,
    getLocales,
} from "./languages";
// @ts-ignore
import * as tsvparser from "uw-tsv-parser";
// @ts-ignore
import * as tsvGroupdataParser from "tsv-groupdata-parser"
import { request } from "node:http";
import { getCheckingFiles } from "./network";
// @ts-ignore
import { referenceHelpers } from 'bible-reference-range';

// helpers
const {
    apiHelpers,
    default: SourceContentUpdater,
    downloadHelpers,
    resourcesHelpers,
    resourcesDownloadHelpers,
    tnArticleHelpers,
    twArticleHelpers,
    STAGE
}   
// @ts-ignore
  = require('tc-source-content-updater');

const SEP = path.sep || '/'
const workingPath = path.join(ospath.home(), 'translationCore')
export const projectsBasePath = path.join(workingPath, 'otherProjects')
export const resourcesPath = path.join(projectsBasePath, 'cache')

const { lexicons } = require('../data/lexicons')

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
 * does http request and returns the response data parsed from JSON
 * @param {string} url
 * @param {number} retries
 * @return {Promise<{Object}>}
 */
export async function makeJsonRequestDetailed(url:string, retries= 5): Promise<any> {
    let result_;
    for (let i = 1; i <= retries; i++) {
        result_ = null;
        try {
            result_ = await new Promise((resolve, reject) => {
                // @ts-ignore
                request(url, function(error: any, response: any, body: string) {
                    if (error)
                        reject(error);
                    else if (response.statusCode === 200) {
                        let result = body;
                        try {
                            result = JSON.parse(body);
                        } catch (e) {
                            reject(e);
                        }
                        resolve({result, response, body});
                    } else {
                        reject(`fetch error ${response.statusCode}`);
                    }
                });
            });
        } catch (e) {
            if (i >= retries) {
                console.warn(`makeJsonRequestDetailed(${url}) - error getting data`, e);
                throw e;
            }
            result_ = null;
            console.log(`makeJsonRequestDetailed(${url}) - retry ${i+1} getting data, last error`, e);
            await delay(500);
        }

        if (result_) {
            break;
        }
    }
    return result_;
}

/**
 * does specific page query and returns the response data parsed from JSON
 * @param {string} url
 * @param {number} page
 * @param {number} retries
 * @return {Promise<{Object}>}
 */
export async function doMultipartQueryPage(url:string, page = 1, retries = 5):Promise<any> {
    const url_ = `${url}&page=${page}`;
    const {result, response} = await makeJsonRequestDetailed(url_, retries);
    const pos = response && response.rawHeaders && response.rawHeaders.indexOf('X-Total-Count');
    const totalCount = (pos >= 0) ? parseInt(response.rawHeaders[pos + 1]) : 0;
    const items = result && result.data || null;
    return {items, totalCount};
}

/**
 * does multipart query and returns the response data parsed from JSON. Continues to read pages until all results are returned.
 * @param {string} url
 * @param {number} retries
 * @return {Promise<{Object}>}
 */
export async function doMultipartQuery(url:string, retries = 5) {
    let page = 1;
    let data:any[] = [];
    const {items, totalCount} = await doMultipartQueryPage(url, page, retries = 5);
    let lastItems = items;
    let totalCount_ = totalCount;
    data = data.concat(items);
    while (lastItems && data.length < totalCount_) {
        const {items, totalCount} = await doMultipartQueryPage(url, ++page, retries = 5);
        lastItems = items;
        totalCount_ = totalCount;
        if (items && items.length) {
            data = data.concat(items);
        }
    }

    return data;
}

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
 * fetches all the resources for doing checking.
 * @param filePath path to the file.
 * @returns A resource collection object.
 */
export function loadResources(filePath: string):null|ResourcesObject {
    if (filePath) {
        const resources = loadResourcesFromPath(filePath, resourcesPath)
        return resources
    }
    throw new Error(
      `loadResources() - invalid checking filePath "${filePath}", cannot find project folder`,
    );
}

/**
 * download selected resource from DCS
 * @param {object} resource - selected resource
 * @param {string} resourcesPath - parent path for resources
 * @param {boolean} byBook - if true then separate resources by book
 * @param {boolean} combineHelps - if true then combine resources to single json
 * @returns {Promise<{byBook: boolean, resource, resourcePath: *, resourceFiles: *[]}>}
 */
async function downloadAndProcessResource(resource:any, resourcesPath:string, byBook = false, combineHelps = false, preRelease = false) {
    try {
        const errorsList:string[] = [];
        const downloadErrorsList:string[] = [];
        const importFolder = path.join(resourcesPath, 'imports')
        fs.emptyDirSync(importFolder) // clear imports folder to remove leftover files
        const config = getConfig(preRelease);
        const result = await resourcesDownloadHelpers.downloadAndProcessResourceWithCatch(resource, resourcesPath, errorsList, downloadErrorsList, config)
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

function getConfig(preRelease: boolean) {
    const stage = preRelease ? STAGE.PRE_PROD : STAGE.PROD;
    const config = {
        stage,
    };
    return config;
}

/**
 * find the latest version resource folder in resourcesPath
 * @param {string} resourcePath - path of downloaded resources
 * @returns {Promise<null>}
 */
export async function getLatestResourcesCatalog(resourcePath:string, preRelease = false) {
    const sourceContentUpdater = new SourceContentUpdater();
    const config = getConfig(preRelease);
    await sourceContentUpdater.getLatestResources([], config)
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
async function getLangHelpsResourcesFromCatalog(catalog:any[], languageId:string, owner:string, resourcesPath:string, preRelease = false) {
    if (!catalog?.length) {
        catalog = await getLatestResourcesCatalog(resourcesPath)
        saveCatalog(catalog, preRelease)
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
async function getLangResourcesFromCatalog(catalog:any[], languageId:string, owner:string, resourcesPath:string, preRelease = false) {
    const { processed, updatedCatalogResources } = await getLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath, preRelease)

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

function getDestFolderForRepoFile(resourcesPath: string, languageId: string, resourceId: string, bookId: string, version: string, owner: string) {
    if (!version || version == 'master') {
        version = 'master'
    } else {
        version = `v${version}`
    }
    // @ts-ignore
    const resourceName = RESOURCE_ID_MAP?.[resourceId]
    let destFolder;
    const isResource = Object.keys(RESOURCE_ID_MAP).includes(resourceId)
    if (isResource) {
        destFolder = path.join(resourcesPath, languageId, apiHelpers.TRANSLATION_HELPS, resourceName, `${version}_${resourcesHelpers.encodeOwnerStr(owner)}`, "books", bookId);
    } else {
        destFolder = path.join(resourcesPath, languageId, "bibles", resourceId, `${version}_${resourcesHelpers.encodeOwnerStr(owner)}`, "books", bookId);
    }
    return destFolder;
}

export async function fetchFileFromRepo(server: string, owner: string, repo: string, branch: string, localRepoPath: string, fileName: string) {
    const baseUrl = `${server}/${owner}/${repo}/raw/branch/${branch}`;
    const results = await fetchFileFromUrl(baseUrl, localRepoPath, fileName);
    return results;
}

export async function fetchFromUrl(downloadUrl: string, destFilePath: string) {
    const destFolder = path.dirname(destFilePath)
    fs.ensureDirSync(destFolder)
    const results = await downloadHelpers.download(downloadUrl, destFilePath);
    return results;
}

export async function fetchFileFromUrl(baseUrl: string, repoFilePath: string, filePath: string) {
    const _filePath = filePath?.replace('./', '')
    const downloadUrl = `${baseUrl}/${_filePath}`
    const destFilePath = path.join(repoFilePath, _filePath)
    let error:string = ''

    try {
        const results = await fetchFromUrl(downloadUrl, destFilePath);
        if (results.status === 200) {
            return { 
                success: true
            }
        }
        error = `fetchFileFromUrl(${downloadUrl}) - returned status ${results.status}`
        console.warn(`fetchFileFromUrl(${downloadUrl}) - returned status ${results.status}`)
    } catch (e) {
        error = `fetchFileFromUrl(${downloadUrl}) - failed`
        console.warn(`fetchFileFromUrl(${downloadUrl}) - failed`)
    }
    return { 
        success: false,
        error
    }
}

async function fetchRepoFile(baseBranchUrl: string, repoFilePath: string, resourcesPath: string, languageId: string, resourceId: string, bookId: string, version: string, owner: string) {
    let downloadUrl = baseBranchUrl + repoFilePath;
    const destFolder = getDestFolderForRepoFile(resourcesPath, languageId, resourceId, bookId, version, owner);
    let destFilePath: string | null = path.join(destFolder, repoFilePath);
    let contents = ''

    fs.ensureDirSync(destFolder);
    fs.removeSync(destFilePath); // make sure no file present
    console.log(`fetching ${downloadUrl}`);
    const results = await downloadHelpers.download(downloadUrl, destFilePath);

    if (results.status === 200) {
        contents = fs.readFileSync(destFilePath, "UTF-8")?.toString()
    } else {
        destFilePath = null;
        const message = `Download ${downloadUrl} error, status: ${results.status}`;
        console.log(message);
        throw message
    }
    return {
        contents,
        filePath: destFilePath,
    };
}

export async function fetchBibleManifest(baseUrl: string, owner: string, languageId: string, resourceId: string, resourcesPath: string, bookId: string, version = 'master') {
    if (!baseUrl) {
        baseUrl = "https://git.door43.org/"; // default
    }
    let rawUrl;
    if (version === 'master') {
        rawUrl = `${baseUrl}${owner}/${languageId}_${resourceId}/raw/branch/master/`;
    } else {
        rawUrl = `${baseUrl}${owner}/${languageId}_${resourceId}/raw/tag/v${version}/`;
    }
    const repoFilePath = "manifest.yaml";
    const {
        contents: manifestYaml,
        filePath: destFilePath,
    } = await fetchRepoFile(rawUrl, repoFilePath, resourcesPath, languageId, resourceId, bookId, version, owner);
    const manifest = YAML.parse(manifestYaml);
    return { rawUrl, manifest, manifestYaml };
}

/**
 * search catalog to find and download bible match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourceId
 * @param {string} resourcesPath - parent path for resources
 * @param bookId - fetch only this book
 * @returns {Promise<*>} -
 */
async function fetchBibleResourceBook(catalog:any[], languageId:string, owner:string, resourceId:string, resourcesPath:string, bookId:string, version = 'master') {
    try {
        const item = findResource(catalog, languageId, owner, resourceId)
        if (item) {
            // example: https://git.door43.org/es-419_gl/es-419_glt/raw/branch/master/manifest.yaml
            //   or:
            //      https://git.door43.org/es-419_gl/es-419_glt/raw/tag/v41/manifest.yaml
            
            const parts = item.downloadUrl?.split(owner)
            let baseUrl = ''
            if (parts?.length) {
                baseUrl = parts[0]
            }
            const {
                rawUrl,
                manifest,
                manifestYaml,
            } = await fetchBibleManifest(baseUrl, owner, languageId, resourceId, resourcesPath, bookId, version);
            const destFolder = getDestFolderForRepoFile(resourcesPath, languageId, resourceId, bookId, version, owner);
            fs.emptyDirSync(destFolder);
            fs.outputFileSync(path.join(destFolder, 'manifest.yaml'), manifestYaml, 'UTF-8')

            // @ts-ignore
            const project = manifest?.projects?.find((project: {}) => project.identifier === bookId)
            const bookPath = project?.path?.replace('./', '')
            if (bookPath) {
                const {
                    contents: bookContents,
                    filePath: bookFilePath
                } = await fetchRepoFile(rawUrl, bookPath, resourcesPath, languageId, resourceId, bookId, version, owner);
                
                try {
                    const bookPath = 'LICENSE.md'
                    await fetchRepoFile(rawUrl, bookPath, resourcesPath, languageId, resourceId, bookId, version, owner);
                } catch (e) {
                    console.warn(`fetchBibleResourceBook - could not download license file from ${path.join(rawUrl)}`)
                }
                
                if (bookContents && bookFilePath) {
                    return destFolder;
                }
            } else {
                console.warn(`fetchBibleResourceBook - could not download book ${path.join(rawUrl)}`)
            }
        }
    } catch (err) {
        console.warn(`fetchBibleResourceBook - could not download resources`, err)
    }
    return null
}

/**
 * search catalog to find and download bible match for owner, languageId, resourceId
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourceId
 * @param {string} resourcesPath - parent path for resources
 * @param bookId - fetch only this book
 */
async function fetchHelpsResourceBook(catalog:any[], languageId:string, owner:string, resourceId:string, resourcesPath:string, bookId:string, version = 'master') {
    try {
        const item = findResource(catalog, languageId, owner, resourceId)
        if (item) {
            // example: https://git.door43.org/es-419_gl/es-419_glt/raw/branch/master/manifest.yaml
            //   or:
            //      https://git.door43.org/es-419_gl/es-419_glt/raw/tag/v41/manifest.yaml

            const parts = item.downloadUrl?.split(owner)
            let baseUrl = ''
            if (parts?.length) {
                baseUrl = parts[0]
            }
            const {
                rawUrl,
                manifest,
                manifestYaml,
            } = await fetchBibleManifest(baseUrl, owner, languageId, resourceId, resourcesPath, bookId, version);

            const destFolder = getDestFolderForRepoFile(resourcesPath, languageId, resourceId, bookId, version, owner);
            fs.emptyDirSync(destFolder);
            fs.outputFileSync(path.join(destFolder, 'manifest.yaml'), manifestYaml, 'UTF-8')

            // @ts-ignore
            const project = manifest?.projects?.find((project: {}) => project.identifier === bookId)
            const bookPath = project?.path?.replace('./', '')
            if (bookPath) {
                const {
                    contents: bookContents,
                    filePath: bookFilePath
                } = await fetchRepoFile(rawUrl, bookPath, resourcesPath, languageId, resourceId, bookId, version, owner);
                if (bookContents && bookFilePath) {
                    return { destFolder, manifest, bookFilePath};
                }
            } else {
                console.warn(`fetchHelpsResourceBook - could not download book ${path.join(rawUrl, bookPath)}`)
            }
        }
    } catch (err) {
        console.warn(`fetchHelpsResourceBook - could not download resources`, err)
    }
    return null
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

function verifyHaveHelpsResource(resource:any, resourcesPath:string, languageId:string, owner:string, catalog:null|any[] = null, bookId = ''):null|object {
    // @ts-ignore
    const resourceId = resource?.id;
    // @ts-ignore
    const resourceName = RESOURCE_ID_MAP[resourceId] || ''
    const folderPath = path.join(resourcesPath, languageId, 'translationHelps', resourceName) // , `v${resource.version}_${resource.owner}`)
    const versionPath = resourcesHelpers.getLatestVersionInPath(folderPath, owner, false)
    const couldBeSingleBookDownload = bookId && isHelpsBookBased(resourceId)

    if (versionPath && fs.pathExistsSync(versionPath)) {
        if (catalog) {
            const {version, owner} = resourcesHelpers.getVersionAndOwnerFromPath(versionPath)
            const item = findResource(catalog, languageId, owner, resourceId)
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
            id: resourceId,
            languageId,
            path: versionPath
        }
        
        if (!resource?.bookRes) {
            const filePath = path.join(versionPath, `${resourceId}.json`)
            if (fs.pathExistsSync(filePath)) {
                return resourceObject
            } else {
                console.log(`verifyHaveHelpsResource() - Could not find file: ${versionPath}`)
                return null
            }
        } else { // by book
            const subFolders = ['.']
            if (couldBeSingleBookDownload) {
                subFolders.push(path.join(`books/${bookId}`))
            }
            for (const subFolder of subFolders) {
                const checkPath = path.join(versionPath, subFolder);
                if (fs.pathExistsSync(checkPath)) {
                    const files = fs.readdirSync(checkPath).filter((filename: string) => path.extname(filename) === ".json");
                    if (files?.length) {
                        return resourceObject;
                    }
                }
            }
            console.log(`verifyHaveHelpsResource() - Could not find files in : ${versionPath}`)
            return null
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
function verifyHaveBibleResource(bibleId:string, resourcesPath:string, languageId:string, owner:string, catalog:null|any[] = null, checkForUsfm = false, bookId = ''):null|string {
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

        let bibleBooks = []
        const checkPath = bookId ? path.join(versionPath, 'books', bookId) : versionPath
        if (checkForUsfm) { // each book is an USFM file
            bibleBooks = getBibleBookFiles(checkPath)
        } else { // each book is a chapter
            bibleBooks = fs.existsSync(checkPath) && fs.readdirSync(checkPath)
              .filter((file:string) => path.extname(file) !== '.json' && file !== '.DS_Store');
        }
        if (bibleBooks?.length) {
            return versionPath
        } else {
            console.log(`verifyHaveBibleResource() - Could not find files in : ${checkPath}`)
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
function verifyHaveGlHelpsResources(languageId:string, owner:string, resourcesPath:string, catalog:null|any[] = null, bookId = '') {
    let found = true
    const resources = {}
    for (const resource of checkingHelpsResources) {
        let resource_ = verifyHaveHelpsResource(resource, resourcesPath, languageId, owner, catalog, bookId)

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

async function parseBookTsv(resourceId: string, bookId: string, item:{}, originalBiblePath: string, tsvFolder: string, tsvPath: string, resourcesPath: string) {
    let error = false
    const resourceFiles:string[] = []
    const outputFolder = path.join(tsvFolder || "", bookId);
    
    const bibleBooks = getBibleBookFiles(originalBiblePath, bookId);
    for (const book of bibleBooks) {
        const matchLowerCase = book.toLowerCase();
        if (matchLowerCase.includes(bookId)) {
            const bookPath = path.join(originalBiblePath, book);
            parseAndSaveUsfm(bookPath, originalBiblePath, bookId);
        }

    }
    if (resourceId === "twl") {
        try {
            const project = {
                identifier: bookId,
                // @ts-ignore
                languageId: item.languageId,
            };
            const groupData = await twArticleHelpers.twlTsvToGroupData(tsvPath, project, resourcesPath, originalBiblePath, outputFolder);
            console.log(groupData);
        } catch (e) {
            console.error(`parse twl failed`, e);
            error = true
        }
    } else if (resourceId === "tn") {
        try {
            const params = { categorized: true };
            // @ts-ignore
            const groupData = await tsvGroupdataParser.tsvToGroupData7Cols(tsvPath, bookId, resourcesPath, item.languageId, "translationNotes", originalBiblePath, params);
            tnArticleHelpers.convertEllipsisToAmpersand(groupData, tsvPath);
            await tsvGroupdataParser.formatAndSaveGroupData(groupData, outputFolder, bookId);
        } catch (e) {
            console.error(`parse tn failed`, e);
            error = true
        }
    }
    if (!error) {
        const ignoreIndex = resourceId === 'tn'
        const contents = readHelpsFolder(outputFolder, bookId, ignoreIndex)
        const outputPath = path.join(tsvFolder, `${resourceId}_${bookId}.json`)
        fs.outputJsonSync(outputPath, contents, { spaces: 2 })
        resourceFiles.push(outputPath)
    }
    if (!error) {
        return {
            resourcePath: tsvFolder,
            resourceFiles,
            byBook: true
        }
    }
    return null
}

function isHelpsBookBased(resourceId:string) {
    return ['twl', 'tn'].includes(resourceId);
}

async function ensureWeHaveBible(resourcesPath: string, languageId: string, bibleId: string, version: string, owner: string, bookId: string, catalog: any[] | null) {
    let haveBible = false;
    const bibleFolder = path.join(resourcesPath, languageId, "bibles", bibleId, `v${version}_${resourcesHelpers.encodeOwnerStr(owner)}`, "books", bookId);
    let biblePath = bibleFolder;
    let files = getFilesOfType(bibleFolder, ".json");
    if (!files?.length) {
        files = getFilesOfType(path.join(bibleFolder, bookId), ".json"); // also check subfolder
    }
    if (!files?.length) { // if we don't have bible, download it
        biblePath = await fetchBibleResourceBook(catalog || [], languageId, owner, bibleId, resourcesPath, bookId, version || "") || "";
        if (biblePath) {
            const bibleBooks = getBibleBookFiles(biblePath, bookId);
            for (const book of bibleBooks) {
                parseAndSaveUsfm(path.join(biblePath, book), biblePath, bookId);
                haveBible = true;
            }
        }
    } else {
        haveBible = true;
    }
    return { haveBible, biblePath };
}

/**
 * search the catalog to find and download the translationHelps resources (ta, tw, tn, twl) along with dependencies
 * @param {object[]} catalog - list of items in catalog
 * @param {string} languageId
 * @param {string} owner
 * @param {string} resourcesPath - parent path for resources
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
export async function downloadLatestLangHelpsResourcesFromCatalog(catalog:null|any[], languageId:string, owner:string, resourcesPath:string, callback:Function|null = null, preRelease = false, bookId = '') {
    if (!catalog?.length) {
        catalog = await getLatestResourcesCatalog(resourcesPath, preRelease)
    }
    callback && await callback('Downloaded Catalog')

    let error = false
    const processed:any[] = []
    let foundResources = verifyHaveGlHelpsResources(languageId, owner, resourcesPath, catalog, bookId)
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
            console.error('downloadLatestLangHelpsResourcesFromCatalog - Resource item not found', {languageId, owner, resourceId: resource.id})
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
        const isBookBasedHelps = isHelpsBookBased(resourceId)
        let expectedRepo = path.join(resourcesPath, languageId_, apiHelpers.TRANSLATION_HELPS, resourceName, `v${version}_${resourcesHelpers.encodeOwnerStr(owner_)}`)
        if (bookId && isBookBasedHelps) {
            expectedRepo = path.join(expectedRepo, 'books', bookId)
        }
        const files = getFilesOfType(expectedRepo, ".json");
        if (files?.length) {
            console.log('downloadLatestLangHelpsResourcesFromCatalog - already have downloaded', item)
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
            let resource_ = null
            if (bookId && isBookBasedHelps) {
                // @ts-ignore
                const { destFolder: tsvFolder, manifest, bookFilePath: tsvPath } = await fetchHelpsResourceBook(catalog || [], languageId_, owner_, resourceId, resourcesPath, bookId, version) || {};
                const relation = manifest?.dublin_core?.relation
                if (relation) {
                    // make sure we have right version of original bible
                    const _isNT = isNT(bookId)
                    const origLang = _isNT ? NT_ORIG_LANG : OT_ORIG_LANG
                    const { bibleId: origBibleId, version: origLangVersion } = getTsvOLVersionForBook(relation, bookId)
                    let originalBiblePath = null
                    if (origLangVersion) {
                        const originalLanguageOwner = apiHelpers.getOwnerForOriginalLanguage(owner_);
                        const {
                            haveBible,
                            biblePath,
                        } = await ensureWeHaveBible(resourcesPath, origLang, origBibleId, origLangVersion, originalLanguageOwner, bookId, catalog);
                        
                        if (haveBible) {
                            // get aligned bible
                            for (const bibleId_ of ['glt', 'ult', 'gst', 'ust']) {
                                const item_ = findResource(catalog || [], languageId_, owner_, bibleId_)
                                if (item_) {
                                    const {
                                        haveBible
                                    } = await ensureWeHaveBible(resourcesPath, languageId_, bibleId_, item_?.version, owner_, bookId, catalog);
                                    if (!haveBible) {
                                        console.error("downloadLatestLangHelpsResourcesFromCatalog - failed to download aligned bible", item_);
                                    }
                                    break;
                                }
                            }
                            
                            originalBiblePath = biblePath
                            const results = await parseBookTsv(resourceId, bookId, item, originalBiblePath || '', tsvFolder || '', tsvPath || '', resourcesPath);
                            resource_ =  results ? {
                                ...results,
                                resource: item,
                                processed: true,
                            } : null
                        }
                    }
                }
            } else {
                resource_ = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false, preRelease);
            }
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
                // @ts-ignore
                if (!resource_?.processed) { // if not already processed
                    const success = await processHelpsIntoJson(item, resourcesPath, resourcePath, resource_.resourceFiles, resource_.byBook, ignoreIndex);
                    if (!success) {
                        console.error("downloadLatestLangHelpsResourcesFromCatalog - could not process", item);
                        error = true;
                    }
                }
            } else {
                error = true
                // @ts-ignore
                console.error('downloadLatestLangHelpsResourcesFromCatalog - could not download Resource item', {
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
 * @param callback
 * @returns {Promise<{updatedCatalogResources, processed: *[]}>}
 */
export async function getLatestLangGlResourcesFromCatalog(catalog:null|any[], languageId:string, owner:string, resourcesPath:string, callback:Function|null = null, preRelease = false, bookId = '') {
    const { processed, updatedCatalogResources, foundResources } = await downloadLatestLangHelpsResourcesFromCatalog(catalog, languageId, owner, resourcesPath, callback, preRelease, bookId)

    // @ts-ignore
    foundResources.bibles = []

    // get aligned bibles
    const alignedBiblesList = [['glt', 'ult'], ['gst', 'ust'], [BooksOfTheBible.NT_ORIG_LANG_BIBLE], [BooksOfTheBible.OT_ORIG_LANG_BIBLE]]
    for (const alignedBibles of alignedBiblesList) {
        let fetched = false
        for (const bibleId of alignedBibles) {
            const langId = getLanguageForBible(languageId, bibleId);
            const { languageId_, owner_ } = getLanguageAndOwnerForBible(langId, owner, bibleId)

            const foundPath = verifyHaveBibleResource(bibleId, resourcesPath, languageId_, owner_, catalog, false, bookId)
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
                    let resource = null
                    if (bookId) {
                        try {
                            const bibleFoundPath = await fetchBibleResourceBook(updatedCatalogResources || [], languageId_, owner_, bibleId, resourcesPath, bookId, item.version);
                            resource = { resourcePath: bibleFoundPath, resourceFiles: [], resource: item, byBook: true}
                        } catch (e) {
                            console.error(`getLangResourcesFromCatalog - cannot download target bible book ${bookId} from server`, e);
                        }
                    } else {
                        resource = await downloadAndProcessResource(item, resourcesPath, item.bookRes, false);
                    }
                    if (resource) {
                        processed.push(resource)
                        fetched = true
                        const _bible = {
                            bibleId: bibleId,
                            languageId: languageId_,
                            owner: owner_,
                            path: resource.resourcePath
                        };

                        if (!isOriginalBible(bibleId)) {
                            // @ts-ignore
                            foundResources.bibles.push(_bible)
                        }

                        // @ts-ignore
                        foundResources[bibleId] = _bible
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

export function getRepoFileName(targetLanguageId: string, targetBibleId: string, glLanguageId: string, bookId: string) {
    let repoFolderName = `${targetLanguageId}_${targetBibleId}_${glLanguageId}`;
    if (bookId) {
        repoFolderName += `_${bookId}`;
    }
    return repoFolderName;
}

export function getRepoPath(targetLanguageId:string, targetBibleId:string, glLanguageId:string, projectsPath = projectsBasePath, bookId: string = '') {
    const repoFolderName = getRepoFileName(targetLanguageId, targetBibleId, glLanguageId, bookId);
    return path.join(projectsPath, repoFolderName)
}

/**
 * get list of bible USFM files
 * @param repoPath
 * @param bookId
 */
export function getBibleBookFiles(repoPath: string, bookId:string | null = null) {
    if (fs.pathExistsSync(repoPath)) {
        return fs.readdirSync(repoPath).filter((filename: string) => {
            let validFile = (path.extname(filename) === ".USFM") || (path.extname(filename) === ".usfm");
            if (validFile && bookId) {
                validFile = filename.toLowerCase().includes(bookId)
            }
            return validFile
        });
    }
    return []
}

/**
 * get list of bible folders
 * @param repoPath
 * @param bookId
 */
export function getBibleBookFolders(repoPath: string, bookId:string | null = null) {
    if (fs.pathExistsSync(repoPath)) {
        const bookIdsToMatch = bookId ? [bookId] : Object.keys(ALL_BIBLE_BOOKS)
        return fs.readdirSync(repoPath).filter((filename: string) => {
            const validFolder = bookIdsToMatch.includes(filename)
            return validFolder
        });
    }
    return []
}

/**
 * replace the home path with '~'
 * @param filePath
 */
export function removeHomePath(filePath:string) {
    if (filePath && (filePath.indexOf(ospath.home()) === 0)) {
        const newPath = filePath.replace(ospath.home(), '~')
        return newPath
    }
    return filePath
}

function isHomePath(filePath: string) {
    return filePath && (filePath.indexOf("~") === 0);
}

/**
 * replace leading ~ with home path
 * @param filePath
 */
function replaceHomePath(filePath:string) {
    if (isHomePath(filePath)) {
        const newPath = filePath.replace('~', ospath.home())
        return newPath
    }
    return filePath
}

function cleanupPath(filePath:string, repoPath:string) {
    let _filePath = replaceHomePath(filePath)
    if (filePath[0] === '.') {
        _filePath = path.join(repoPath, _filePath)
    }
    return _filePath
}

export async function downloadTargetBible(targetBibleId: string, resourcesBasePath: string, targetLanguageId: string, targetOwner: string, updatedCatalogResources: any[], bookId:string|null, version = 'master') {
    let targetFoundPath = null;

    if (bookId) {
        try {
            targetFoundPath = await fetchBibleResourceBook(updatedCatalogResources, targetLanguageId, targetOwner, targetBibleId, resourcesBasePath, bookId, version);
        } catch (e) {
            console.error(`downloadTargetBible - cannot download target bible book ${bookId} from server`, e);
        }
    } else {
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
                    console.error(`downloadTargetBible - cannot download target bible from server`);
                    targetFoundPath = null;
                } else {
                    targetFoundPath = results.destFolder;
                }
            }
        } catch (e) {
            console.error(`downloadTargetBible - cannot copy target bible from server`, e);
        }
    }
    return targetFoundPath;
}

function copyResources(sourceTsvsPath: string, checkingPath: string, bookId:string|null = null, fileType:string = '.json') {
    fs.ensureDirSync(checkingPath);
    if (bookId) {
        let _sourcePath = sourceTsvsPath;
        let files = getFilesOfType(_sourcePath, fileType, bookId);
        if (!files?.length) {
            _sourcePath = path.join(sourceTsvsPath, 'books', bookId)
            files = getFilesOfType(_sourcePath, fileType, bookId);
        }
        for(const file of files) {
            const sourcePath = path.join(_sourcePath, file);
            const destPath = path.join(checkingPath, file);
            fs.copySync(sourcePath, destPath); 
        }
    } else {
        fs.copySync(sourceTsvsPath, checkingPath);
    }
}

export function getSubFolderForResource(resourceId: string) {
    return `./checking/${resourceId}`;
}

export function getFileSubPathForResource(resourceId: string, bookId: string | null) {
    const folder = getSubFolderForResource(resourceId);
    const fileName = getCheckingFileNameForBook(bookId || "", resourceId);
    return path.join(folder, fileName);
}

function parseAndSaveUsfm(bookPath: string, targetPath: string, bookId: string | null) {
    const usfm = fs.readFileSync(bookPath, "utf8");
    const json = getParsedUSFM(usfm);
    const targetBookDestPath = path.join(targetPath, bookId || "");
    // save each chapter as json file
    const bookData = json.chapters;
    for (const chapterNum of Object.keys(bookData)) {
        const chapterData = bookData[chapterNum];
        fs.outputJsonSync(path.join(targetBookDestPath, `${chapterNum}.json`), chapterData, { spaces: 2 });
    }
    // save header as json file
    fs.outputJsonSync(path.join(targetBookDestPath, "headers.json"), json.headers, { spaces: 2 });
    return bookData;
}

/**
 * get the extension name for resourceId
 * @param resourceId
 */
export function getCheckingExtension(resourceId: string) {
    return `.${resourceId}_check`;
}

/**
 * get the folder name for bookId and resourceId
 * @param bookId
 * @param resourceId
 */
export function getCheckingFileNameForBook(bookId: string, resourceId: string) {
    return `${bookId}${getCheckingExtension(resourceId)}`;
}

/**
 * get the folder name for resourceId
 * @param resourceId
 */
export function getCheckingPathName(resourceId: string) {
    return `${resourceId}_checksPath`;
}

/**
 * remap the GL verse references to target verse reference
 * @param groupsData
 * @param bookId
 * @param targetBook
 */
export function reMapGlVerseRefsToTarget_(groupsData: GeneralObject, bookId: string, targetBook: GeneralObject) {
    for (const category of Object.keys(groupsData)) {
        if (category === "manifest") {
            continue; // skip manifest
        }

        // @ts-ignore
        let groups: {} = groupsData[category];
        console.log("groups", Object.keys(groups));

        // @ts-ignore
        const _groups = groups?.groups;
        if (_groups) {
            groups = _groups;
            console.log("groups2", Object.keys(groups));
        }

        // console.log('groups',Object.keys(groups))
        for (const groupId of Object.keys(groups)) {
            // console.log('groupId',groupId)
            // @ts-ignore
            const group: object[] = groups[groupId];

            if (Array.isArray(group)) {
                // console.log('group',group)
                const newGroup = group.map(item => {
                    // @ts-ignore
                    const reference = item.contextId?.reference;
                    if (reference.bookId === bookId) { // only process if same book
                        let chapter = reference.chapter;
                        let verse = reference.verse;
                        const ref = chapter + ":" + verse;
                        const verseRefs = referenceHelpers.getVerses(targetBook, ref);

                        const length = verseRefs.length;
                        if (length === 1) {
                            const verseRef = verseRefs[0];
                            if ((verseRef.verse !== verse) || (verseRef.chapter !== chapter)) {
                                reference.chapter = chapter;
                                reference.verse = verse;
                            }
                        } else if (length > 1) {
                            const newRef = referenceHelpers.convertReferenceChunksToString(verseRefs);
                            const parts = newRef.split(":");
                            const chapter = parts[0];
                            const remaining = parts.slice(1);
                            const verse = remaining.join(":");
                            reference.chapter = chapter;
                            reference.verse = verse;
                        }
                    }
                    return item;
                });
            } else {
                // console.log(`group is not an array`)
            }
        }
    }
}

/**
 * remap the GL verse references to target verse reference
 * @param repoPath
 * @param resourceId
 * @param bookId
 * @param targetBook
 */
function reMapGlVerseRefsToTarget(repoPath: string, resourceId: string, bookId: string, targetBook: GeneralObject) {
    const checkingPath = path.join(repoPath, "checking", resourceId);
    const fileName = getCheckingFileNameForBook(bookId || "", resourceId);
    const checkingFilePath = path.join(checkingPath, fileName);
    const groupsData = fs.readJsonSync(checkingFilePath) as GeneralObject;

    reMapGlVerseRefsToTarget_(groupsData, bookId, targetBook);

    fs.outputJsonSync(checkingFilePath, groupsData, { spaces: 2 });
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
 * @param catalog
 * @param callback
 * @param bookId
 */
export async function initProject(repoPath:string, targetLanguageId:string, targetOwner:string, targetBibleId:string, gl_languageId:string, gl_owner:string, resourcesBasePath:string, sourceResourceId:string|null, catalog:null|any[] = null, callback:Function|null = null, bookId = '', preRelease = false) {
    let errorMsg
    const projectExists = fs.pathExistsSync(repoPath)
    const resourceIds = sourceResourceId ? [sourceResourceId] : ['twl', 'tn']
    let hasCheckingFiles = true
    for (const resourceId of resourceIds) {
        const checkingPath = path.join(repoPath, 'checking', resourceId)
        const checkingFiles = getFilesOfType(checkingPath, getCheckingExtension(resourceId))
        const hasCheckingFiles_ = checkingFiles?.length
        if (!hasCheckingFiles_) {
            hasCheckingFiles = false
        }
    }
    let bibleBooks = getBibleBookFiles(repoPath, bookId)
    if (!bibleBooks?.length) {
        bibleBooks = getBibleBookFolders(repoPath, bookId)
    }
    const hasBibleBooks = bibleBooks?.length

    const shouldCreateProject = !projectExists
        || (hasBibleBooks && !hasCheckingFiles)

    // create metadata
    const checkingMetaData: GeneralObject = {
        resourceType: "Translation Checker",
        targetLanguageId,
        targetOwner,
        targetBibleId,
        gatewayLanguageId: gl_languageId,
        gatewayLanguageOwner: gl_owner,
        resourcesBasePath: removeHomePath(resourcesBasePath),
    };
    
    if (bookId) {
        checkingMetaData.bookId = bookId
    }

    if (!(gl_owner && gl_languageId)) {
        errorMsg = `Missing GL info`;
        console.error(`initProject - Missing GL info:`, { gl_owner, gl_languageId});
    } else
    if (shouldCreateProject) {
        const sourceTsvsPaths = {}
        try {
            const { processed, updatedCatalogResources, foundResources } = await getLatestLangGlResourcesFromCatalog(catalog, gl_languageId, gl_owner, resourcesBasePath, callback, preRelease, bookId)
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
                        let manifestPath = sourceTsvsPath
                        if (bookId) {
                            manifestPath = path.join(sourceTsvsPath, "books", bookId);
                        }
                        const _manifest = getResourceManifest(manifestPath)
                        // @ts-ignore
                        const relation = _manifest?.dublin_core?.relation
                        if (relation) {
                            const key = `${resourceId}_relation`
                            // @ts-ignore
                            checkingMetaData[key] = relation
                        }
                        const checkingPath = path.join(repoPath, 'checking', resourceId)
                        const fileType = ".json";
                        copyResources(sourceTsvsPath, checkingPath, bookId, fileType);

                        // create check files from json files
                        const files = getFilesOfType(checkingPath, fileType);
                        if (files?.length) {
                            for (const filename of files) {
                                const _bookId = getBookIdFromPath(filename);
                                const newName = getCheckingFileNameForBook(_bookId || '', resourceId);
                                if (newName !== filename) {
                                    fs.moveSync(path.join(checkingPath, filename), path.join(checkingPath, newName));
                                }
                            }
                        }
                    }
                }

                if (!hasBibleBooks) {
                    callback && await callback(`Verifying Target Bible ${targetLanguageId}/${targetBibleId}`)
                    const targetFoundPath = await downloadTargetBible(targetBibleId, resourcesBasePath, targetLanguageId, targetOwner, updatedCatalogResources, bookId);
                    if (!targetFoundPath) {
                        return {
                            success: false,
                            errorMsg: `cannot download target bible from server`,
                        };
                    } else {
                        // parse USFM
                        const bibleBooks = getBibleBookFiles(targetFoundPath, bookId);
                        for (const book of bibleBooks) {
                            const matchLowerCase = book.toLowerCase()
                            if (matchLowerCase.includes(bookId)) {
                                const bookPath = path.join(targetFoundPath, book);
                                const targetPath = path.join(repoPath, 'targetBible');
                                const targetBook = parseAndSaveUsfm(bookPath, targetPath, bookId);
                                // copy manifest
                                const manifest = getResourceManifest(targetFoundPath)
                                fs.outputJsonSync(path.join(targetPath, 'manifest.json'), manifest, { spaces: 2 });
                                const repoManifest = {
                                    ...manifest,
                                    subject: "Checking",
                                    description: "Checking",
                                    projects: getCheckingFiles(repoPath),
                                    // @ts-ignore
                                    resource_title: "Checking: " + manifest?.resource_title,
                                }
                                // fs.outputJsonSync(path.join(targetPath, '..', 'manifest.json'), repoManifest, { spaces: 2 });
                                const yamlData = YAML.stringify(repoManifest, 4);
                                fs.outputFileSync(path.join(targetPath, '..', 'manifest.yaml'), yamlData, "UTF-8");

                                const fileName = 'LICENSE.md';
                                const sourcePath = path.join(targetFoundPath, fileName);
                                if (fs.existsSync(sourcePath)) {
                                    fs.copySync(sourcePath, path.join(targetPath, fileName))
                                    fs.copySync(sourcePath, path.join(repoPath, fileName))
                                }
                                
                                reMapGlVerseRefsToTarget(repoPath, "tn", bookId, targetBook);
                                reMapGlVerseRefsToTarget(repoPath, "twl", bookId, targetBook);
                            }
                        }
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
                            let newPath
                            if (['ta', 'tw'].includes(resourceId)) {
                                // copy this resource into project
                                const subPath = path_.split('cache')[1]
                                const destFolder = path.join(repoPath, '.resources', subPath)
                                fs.ensureDirSync(destFolder)
                                fs.copySync(path_, destFolder)
                                newPath = destFolder.replace(repoPath, '.')
                            } else {
                                // @ts-ignore
                                newPath = removeHomePath(path_);
                            }
                            // @ts-ignore
                            resource.path = newPath
                        }
                    }
                }
                
                // @ts-ignore
                checkingMetaData.otherResources = foundResources;
                const metadata = {
                    [checkingName]: checkingMetaData
                }
                for (const resourceId of resourceIds) {
                    const checkingPathName = `${resourceId}_checksPath`
                    // @ts-ignore
                    checkingMetaData[checkingPathName] = getSubFolderForResource(resourceId)
                    const tsvSourcePathName = `${resourceId}_helpsPath`
                    // @ts-ignore
                    checkingMetaData[tsvSourcePathName] = removeHomePath(sourceTsvsPaths[resourceId])
                }
                
                const outputPath = path.join(repoPath, 'metadata.json')
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

function updatedResourcesPath(preRelease:boolean) {
    const fileName = preRelease ? "updatedResourcesPreRelease.json" : "updatedResources.json";
    return path.join(resourcesPath, fileName);
}

export function saveCatalog(catalog:object, preRelease = false) {
    fs.ensureDirSync(resourcesPath)
    fs.outputJsonSync(updatedResourcesPath(preRelease), catalog)
}

export function getSavedCatalog(preRelease = false):null|object[] {
    let _updatedResourcesPath = updatedResourcesPath(preRelease);
    const fileExists = fs.existsSync(_updatedResourcesPath);
    const updatedResources = fileExists ? fs.readJsonSync(_updatedResourcesPath) : null
    return updatedResources
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
                const resourcePathKey = getCheckingPathName(resourceId);
                if (checkingMetadata?.[resourcePathKey]) { // metadata initialized for resourceId
                    metaDataInitialized = true
                    const checkingPath = path.join(repoPath, checkingMetadata[resourcePathKey])
                    const checkingFiles = getFilesOfType(checkingPath, getCheckingExtension(resourceId))
                    checksInitialized = !!checkingFiles?.length
                    if (!checksInitialized) {
                        console.log(`isRepoInitialized - checks not present at ${checkingPath}`)
                        break
                    }
                    const helpsPathKey = `${resourceId}_helpsPath`;
                    if (checkingMetadata?.[helpsPathKey]) {
                        const helpsPath = cleanupPath(checkingMetadata[helpsPathKey], repoPath)
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
        const bibleBooks = getBibleBookFiles(repoPath)
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
    const checksPath = path.join(repoPath, metadata[ getCheckingPathName(resourceId)]);
    const checkType = getCheckingExtension(resourceId);
    const twlPath = path.join(checksPath, `${bookId}${checkType}`);
    let resource = readJsonFile(twlPath);
    let hasResourceFiles = hasResourceData(resource);
    if (!hasResourceFiles) { // if we don't have checking the specific book, check to see if we have checks for other books at least
        const files = getFilesOfType(checksPath, checkType);
        hasResourceFiles = !!files.length;
        resource = {}
    }
    return { resource, hasResourceFiles };
}

function makeSureBibleIsInProject(bible: any, resourcesBasePath: string, repoPath: string, changed: boolean, metadata: object, bookId:string|null = null) {
    const projectResources = `.${SEP}.resources${SEP}`;
    const bibleId = bible.bibleId || bible.id;
    let biblePath = bible.path;
    let localChanged = false;
    const resourcesSubFolder = `${SEP}.resources${SEP}`;
    if (!biblePath) {
        // look first in projects folders
        biblePath = getPathForBible(path.join(repoPath, projectResources), bible.languageId, bibleId, bible.owner, bible.version || '');
        if (biblePath) {
            const parts = biblePath.split(resourcesSubFolder)
            if (parts.length >= 2) {
                biblePath = projectResources + parts[1]
            }
        }
        if (!biblePath) { // look in resources cache
            biblePath = getPathForBible(resourcesBasePath, bible.languageId, bibleId, bible.owner, bible.version || '');
        }
        
        if (biblePath) {
            localChanged = true // need to save bible path
            bible.path = biblePath;
            // @ts-ignore
            metadata.otherResources[bibleId] = bible;
        }
    } else {
        // check if in project folders
        const parts = biblePath.split(resourcesSubFolder)
        let inProject = parts.length >= 2;
        if (inProject) { // double check that content is there
            const _biblePath = cleanupPath(biblePath, repoPath);
            inProject = fs.existsSync(path.join( _biblePath,'manifest.yaml'))
        }
        if (!inProject) { // if not in project check if in cache
            const _biblePath = getPathForBible(resourcesBasePath, bible.languageId, bibleId, bible.owner, bible.version || '')
            const testPath = bookId ? path.join(_biblePath, 'books', bookId) : _biblePath
            if (!isEmptyResourceDir(testPath)) {
                biblePath = _biblePath
            } else {
                biblePath = ''
            }
            localChanged = true // need to save bible path
            bible.path = biblePath;
            // @ts-ignore
            metadata.otherResources[bibleId] = bible;
            
        }
    }

    if (isHomePath(biblePath) || !bible.path || localChanged) {
        const matchBase = `~${SEP}translationCore${SEP}otherProjects${SEP}cache${SEP}`;
        const matchedBase = biblePath.substring(0, matchBase.length) === matchBase;
        if (matchedBase || !bible.path || localChanged) {
            const cacheFolder = `${SEP}cache${SEP}`;
            const parts = biblePath.split(cacheFolder);
            if (parts.length >= 2) { // if path is from cache rather than in project, we need to copy it over
                const newPath = projectResources + parts[1];
                const _newFullPath = path.join(repoPath, newPath);

                try {
                    if (isEmptyResourceDir(_newFullPath)) {
                        const src = path.join(replaceHomePath(biblePath));
                        const dest = _newFullPath;
                        const parentDir = path.join(dest, "..");

                        if (bookId) {
                            fs.ensureDirSync(dest);
                            let src_ = path.join(src, 'books', bookId, bookId)
                            let files = getFilesOfType(src_, ".json");
                            if (!files?.length) { // check to see if we have usfm files that need processing
                                const parentPath = path.join(src_, '..');
                                const usfmFiles = getBibleBookFiles(parentPath, bookId)
                                for (const file of usfmFiles) {
                                    const bookPath = path.join(parentPath, file)
                                    parseAndSaveUsfm(bookPath, parentPath, bookId);
                                }
                                files = getFilesOfType(src_, ".json");
                            }
                            const filenames = [bookId, '../manifest.yaml', '../manifest.json']
                            for (const filename of filenames) {
                                if (fs.existsSync(path.join(src_, filename))) {
                                    files.push(filename);
                                }
                            }
                            for (const file of files) {
                                const sourcePath = path.join(src_, file);
                                const destPath = path.join(dest, bookId, file);
                                if (!fs.existsSync(destPath)) {
                                    fs.copySync(sourcePath, destPath);
                                }
                            }
                        } else {
                            fs.ensureDirSync(parentDir);
                            fs.copySync(src, dest);
                        }
                        localChanged = true;
                    }
                    biblePath = newPath;
                    bible.path = biblePath;
                    bible.bibleId = bibleId;
                    // @ts-ignore
                    metadata.otherResources[bibleId] = bible;
                } catch (e) {
                    console.warn(`makeSureBibleIsInProject - could not copy resource from ${biblePath} to ${newPath}`);
                    let parts = biblePath.split(SEP);
                    while (parts.length) {
                        const checkPath = parts.join(SEP);
                        const exists = fs.existsSync(checkPath);
                        if (exists) {
                            break;
                        }
                        parts = parts.slice(0, parts.length - 1);
                    }
                }
            }
        }
    }
    return { bibleId, biblePath, changed: changed || localChanged };
}

function isEmptyResourceDir(fullPath: string) {
    if (fs.existsSync(fullPath)) {
        let files = getFilesOfType(fullPath, ".yaml");
        if (!files.length) {
            files = getFilesOfType(fullPath, ".json");
        }
        const isEmpty = !files.length
        return isEmpty
    }
    return true
}

export function getMetaData(repoPath:string) {
    const pathToMetaData = path.join(repoPath, 'metadata.json')
    const metaData = readJsonFile(pathToMetaData);
    return metaData
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
      const _metadata = fs.readJsonSync(pathToMetaData);
      const metadata = _metadata[checkingName]
      if (metadata) {
          // @ts-ignore
          results.lexicons = lexicons
          // @ts-ignore
          results.metadata = metadata
          // @ts-ignore
          results.locales = getCurrentLocale()
          // @ts-ignore
          results.localeOptions = Object.keys(getLocales())
          
          // get the dependent original bibles for resource
          const key = `${resourceId}_relation`
          // @ts-ignore
          const relation = metadata[key]
          const dependency = relation && getTsvOLVersionForBook(relation, bookId)
          const originalLangVersion = dependency?.version
        
          if (resourceId === 'twl') {
              let { resource, hasResourceFiles } = getCheckingResource(repoPath, metadata, resourceId, bookId);
              // @ts-ignore
              results.twl = resource
              // @ts-ignore
              results.hasTwls = !! hasResourceFiles
              const twResource = metadata.otherResources['tw']
              let twPath = cleanupPath(twResource?.path, repoPath)
              twPath = twPath && path.join(twPath, 'tw.json')
              // @ts-ignore
              results.tw = twPath && readJsonFile(twPath)
          } else
          if (resourceId === 'tn') {
              let { resource, hasResourceFiles } = getCheckingResource(repoPath, metadata, resourceId, bookId);
              const tnPath = path.join(repoPath, metadata[ getCheckingPathName(resourceId)], getCheckingFileNameForBook(bookId, resourceId) );
              // @ts-ignore
              results.tn = resource
              // @ts-ignore
              results.hasTns = !! hasResourceFiles
              // @ts-ignore
              results.tn = readJsonFile(tnPath)
              const taResource = metadata.otherResources['ta']
              let taPath = cleanupPath(taResource?.path, repoPath)
              taPath = taPath && path.join(taPath, 'ta.json')
              // @ts-ignore
              results.ta = taPath && readJsonFile(taPath)
          }

          // @ts-ignore
          results.project = {
              bookId,
              languageId: metadata.targetLanguageId,
              resourceId,
          }

          let book;
          let changed = false

          const biblesList = metadata.otherResources.bibles
          const bibles = []
          const isNT = BooksOfTheBible.isNT(bookId)
          const origLanguageId = isNT ? BooksOfTheBible.NT_ORIG_LANG : BooksOfTheBible.OT_ORIG_LANG
          const origLanguageBibleId = isNT ? BooksOfTheBible.NT_ORIG_LANG_BIBLE : BooksOfTheBible.OT_ORIG_LANG_BIBLE
          const origLangBible = {
              languageId: origLanguageId,
              id: origLanguageBibleId,
              owner: 'unfoldingWord',
              version: originalLangVersion
          }

          const __ret = makeSureBibleIsInProject(origLangBible, resourcesBasePath, repoPath, changed, metadata, bookId);
          changed = __ret.changed;

          const otherOrigLanguageId = !isNT ? BooksOfTheBible.NT_ORIG_LANG : BooksOfTheBible.OT_ORIG_LANG
          const otherOrigLanguageBibleId = !isNT ? BooksOfTheBible.NT_ORIG_LANG_BIBLE : BooksOfTheBible.OT_ORIG_LANG_BIBLE
          const otherOrigLangBible = {
              languageId: otherOrigLanguageId,
              id: otherOrigLanguageBibleId,
              owner: 'unfoldingWord'
          }
          if(!bookId) {
              const ___ret = makeSureBibleIsInProject(otherOrigLangBible, resourcesBasePath, repoPath, changed, metadata, bookId);
              changed = ___ret.changed;
          }

          for (const bible of biblesList) {
              const __ret = makeSureBibleIsInProject(bible, resourcesBasePath, repoPath, changed, metadata, bookId);
              changed = __ret.changed;
          }

          const firstBibleIsOriginal = biblesList?.length
            && (biblesList[0].id === origLangBible.id)
            && (biblesList[0].languageId === origLangBible.languageId)
            && (biblesList[0].owner === origLangBible.owner);
          if (firstBibleIsOriginal) {
              biblesList.shift() // remove it
              changed = true
          }
          
          if (changed) { // update metadata file
              fs.outputJsonSync(pathToMetaData, _metadata, { spaces: 2 });
          }
          
          biblesList.unshift(origLangBible); // insert original bible into first position

          for (const bible of biblesList) {
              const bibleId = bible.bibleId || bible.id;
              let biblePath = bible.path;
              biblePath = cleanupPath(biblePath, repoPath)
              book = getBookOfTheBibleFromFolder(biblePath, bookId)

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
          results.targetBible = getBookOfTheBibleFromFolder(path.join(repoPath, 'targetBible'), bookId)
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
        console.error(`getParsedUSFM error`, e);
    }
}

export function convertJsonToUSFM(bookData:object) {
    try {
        const USFM = usfmjs.toUSFM(bookData, { forcedNewLines: true });
        return USFM
    } catch (e) {
        console.error(`convertJsonToUSFM error`, e);
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
                const bibleBooks = getBibleBookFiles(biblePath)
                let bookPath = path.join(biblePath, bookId);
                if (fs.existsSync(bookPath)) {
                    const bookData = readHelpsFolder(bookPath)
                    // @ts-ignore
                    bookData.manifest = manifest
                    return bookData
                } else {
                    for (const book of bibleBooks) {
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
                if (bibleBooks.length) {
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

export function getPathForBible(resourcesPath: string, languageId: string, bibleId: string, owner: string, version = '') {
    let folderPath = path.join(resourcesPath, languageId, "bibles", bibleId); // , `v${resource.version}_${resource.owner}`)

    if (version) {
        folderPath = path.join(resourcesPath, languageId, "bibles", bibleId, `v${version}_${resourcesHelpers.encodeOwnerStr(owner)}`);
        if (fs.existsSync(folderPath)) {
            return folderPath
        }
        return null
    }

    // if no version given, the use latest
    const versionPath = resourcesHelpers.getLatestVersionInPath(folderPath, owner, false);
    return versionPath;
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
    const versionPath = getPathForBible(resourcesPath, languageId, bibleId, owner);
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

export function getBookForTestament(repoPath: string, isNT = true):string | null {
    // console.log(`loadResourcesFromPath() - filePath: ${filePath}`);
    const testamentBooks = Object.keys(isNT ? BIBLE_BOOKS.newTestament : BIBLE_BOOKS.oldTestament)
    const bibleBooks = getBibleBookFiles(repoPath)
    for (const bibleBook of bibleBooks) {
        const name = path.parse(bibleBook).name || ''
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

export function flattenGroupData(groupsData:{}) {
    let mergedGroups = { }

    for (const category of Object.keys(groupsData)) {
        if (category === 'manifest') {
            continue // skip manifest
        }
        // @ts-ignore
        let groups:{} = groupsData[category]
        // console.log('groups',Object.keys(groups))

        // @ts-ignore
        const _groups = groups?.groups;
        if (_groups) {
            groups = _groups
            // console.log('groups2',Object.keys(groups))
        }
        // console.log('groups',Object.keys(groups))
        for (const groupId of Object.keys(groups)) {
            // console.log('groupId',groupId)
            // @ts-ignore
            const group:object[] = groups[groupId]
            
            if (Array.isArray(group)) {
                // console.log('group',group)
                const newGroup = group.map(item => {
                    const newItem = { ...item }; // shallow copy
                    // @ts-ignore
                    newItem.category = category;
                    return newItem;
                });
                // @ts-ignore
                mergedGroups[groupId] = newGroup;
            } else {
                // console.log(`group is not an array`)
            }
        }
    }

    return mergedGroups;
}

function arrayToTsvLine(keys: string[]) {
    return keys.join('\t');
}

/**
 * convert value to int if string, otherwise just return value
 * @param {string|int} value
 * @returns {int}
 */
export function toInt(value:any):any {
    return (value && typeof value === 'string') ? parseInt(value, 10) : value;
}

function escapeString(content:string) {
  const escaped = (content || '').replaceAll('\t', '\\t').replaceAll('\n', ' ').replaceAll('\r', ' ')
  return escaped
}

function sortRowsByRef(rows: object[]) {
    const _rows = rows.sort((a, b) => {
        // @ts-ignore
        const aCh = toInt(a.chapter);
        // @ts-ignore
        const bCh = toInt(b.chapter);
        let comp = (aCh < bCh) ? -1 : (aCh > bCh) ? 1 : 0;
        if (!comp) {
            // @ts-ignore
            const aV = toInt(a.verse);
            // @ts-ignore
            const bV = toInt(b.verse);
            comp = (aV < bV) ? -1 : (aV > bV) ? 1 : 0;
        }
        return comp;
    });
    return _rows;
}

/**
 * process the TSV data into index files
 * @param {string} tsvLines
 */
export function tsvToObjects(tsvLines:string) {
    let tsvItems;
    let parseErrorMsg;
    let error;
    let expectedColumns = 0;
    const tableObject = tsvparser.tsvStringToTable(tsvLines);

    if ( tableObject.errors.length > 0 ) {
        parseErrorMsg = '';
        expectedColumns = tableObject.header.length;

        for (let i=0; i<tableObject.errors.length; i++) {
            let msg;
            const rownum = tableObject.errors[i][0] - 1; // adjust for data table without header row
            const colsfound = tableObject.errors[i][1];

            if ( colsfound > expectedColumns ) {
                msg = 'Row is too long';
            } else {
                msg = 'Row is too short';
            }
            parseErrorMsg += `\n\n${msg}:`;
            parseErrorMsg += '\n' + tableObject.data[rownum].join(',');
        }
        console.warn(`twArticleHelpers.twlTsvToGroupData() - table parse errors found: ${parseErrorMsg}`);
    }

    try {
        tsvItems = tableObject.data.map((line:string[]) => {
            const tsvItem = {};
            const l = tableObject.header.length;

            for (let i = 0; i < l; i++) {
                const key = tableObject.header[i];
                const value = line[i] || '';
                // @ts-ignore
                tsvItem[key] = value.trim();
            }
            return tsvItem;
        });
    } catch (e) {
        console.error(`tsvToObjects() - error processing data:`, e);
        error = e;
    }
    return {
        tsvItems,
        parseErrorMsg,
        error,
        expectedColumns,
    };
}

export function checkDataToTwl(checkData:{}) {
    let twl:string[] = []
    let rows:object[] = []
    let results:string = ''
    const groups = Object.keys(checkData)
    if (groups?.length > 1) {
        twl = []

        for (const groupId of groups) {
            // @ts-ignore
            const group = checkData[groupId]

            for (const item of group) {
                // @ts-ignore
                const contextId = item.contextId;
                const reference = contextId?.reference;
                const chapter = reference?.chapter || '';
                const verse = reference?.verse || '';
                const Reference = (chapter && verse) ? `${chapter}:${verse}` : ''

                const ID = `${contextId?.checkId || ''}`;
                const category = item.category || '';
                const groupId = contextId?.groupId || '';
                const Tags = `${category}`;
                const quoteString = contextId?.quoteString || '';
                const OrigWords = escapeString(`${quoteString}`);
                const Occurrence = `${contextId?.occurrence || ''}`;
                const TWLink = `rc://*/tw/dict/bible/${category}/${groupId}`
                const selections = item.selections ? escapeString(JSON.stringify(item.selections)) : ''
                const comments = escapeString(item.comments)
                const bookmarks = item.reminder ? '1' : '0'
                const verseEdits = item.verseEdits ? '1' : '0'
                const invalidated = item.invalidated ? '1' : '0'

                rows.push(
                  {
                      Reference, chapter, verse, ID, Tags, OrigWords, Occurrence, TWLink, selections, comments, bookmarks, verseEdits, invalidated
                  },
                )
            }
        }

        const _rows = sortRowsByRef(rows);
        twl = _rows.map(r => arrayToTsvLine([
            // @ts-ignore
            r.Reference,  r.ID, r.Tags, r.OrigWords, r.Occurrence, r.TWLink, r.selections, r.comments, r.bookmarks, r.verseEdits, r.invalidated
        ]))
        const keys = [
            'Reference', 'ID', 'Tags', 'OrigWords', 'Occurrence', 'TWLink', 'selections', 'comments', 'bookmarks', 'verseEdits', 'invalidated'
        ];
        twl.unshift(arrayToTsvLine(keys))
        
        results = twl.join('\n')
    }
    return results
}

function findSelection(checkData: {}, selection: {}):object|undefined {
    let found: object|undefined = undefined;
    // @ts-ignore
    const link = selection?.TWLink || selection?.SupportReference;
    const parts = link?.split('/')
    if (parts?.length) {
        const _groupId = parts[parts.length - 1]
    
        for (const catagoryId of Object.keys(checkData)) {
            if (catagoryId === "manifest") {
                continue;
            }
    
            // @ts-ignore
            const groups = checkData[catagoryId]?.groups || {};
            for (const groupId of Object.keys(groups)) {
    
                // @ts-ignore
                const group = groups[groupId];
    
                for (const item of group) {
                    // @ts-ignore
                    const contextId = item.contextId;
                    const reference = contextId?.reference;
                    const chapter = reference?.chapter || "";
                    const verse = reference?.verse || "";
                    const Reference = (chapter && verse) ? `${chapter}:${verse}` : "";
    
                    const ID = `${contextId?.checkId || ""}`;
                    // const category = item.category || "";
                    const groupId = contextId?.groupId || "";
                    // const Tags = `${category}`;
                    const quoteString = contextId?.quoteString || "";
                    // const OrigWords = `${quoteString}`;
                    // const Occurrence = `${contextId?.occurrence || ""}`;
                    // const selections = item.selections ? JSON.stringify(item.selections) : "";
                    // const TWLink = `rc://*/tw/dict/bible/${category}/${groupId}`;
    
                    if (
                        // @ts-ignore
                        (ID === selection.ID)
                        // @ts-ignore
                        && (Reference === selection.Reference)
                        // @ts-ignore
                        && (groupId === _groupId)
                    ) {
                        found = item
                        return found
                    }
               }
            }
        }
    }
    return found;
}

export function importSelectionsDataIntoCheckData(tsvSelectionData:object[], checkData:{}) {
    let updatedCount = 0
    let importedLines = 0
    let errors:string[]= []
    const categories = Object.keys(checkData)
    if (categories?.length > 1) {
        for (const tsvItem of tsvSelectionData) {
            importedLines++
            // @ts-ignore
            const selections = tsvItem?.selections;
            if (selections && (typeof selections === 'string')) {
                const found = findSelection(checkData, tsvItem);
                if (found) { // if found item to update
                    // @ts-ignore
                    found.selections = JSON.parse(selections)
                    updatedCount++
                } else {
                    const tsvItemStr = JSON.stringify(tsvItem)
                    const error = `importSelectionsDataIntoCheckData: selection not found: ${tsvItemStr}`
                    console.warn(error)
                    errors.push(error)
                }
            }
        }
    }
    return {
        errors,
        importedLines,
        updatedCount,
    }
}

export function checkDataToTn(checkData:{}) {
    let twl:string[] = []
    let rows:object[] = []
    let results:string = ''
    const groups = Object.keys(checkData)
    if (groups?.length > 1) {
        twl = []

        for (const groupId of groups) {
            // @ts-ignore
            const group = checkData[groupId]

            for (const item of group) {
                // @ts-ignore
                const contextId = item?.contextId;
                const reference = contextId?.reference;
                const chapter = reference?.chapter || '';
                const verse = reference?.verse || '';
                const Reference = (chapter && verse) ? `${chapter}:${verse}` : ''

                const ID = `${contextId?.checkId || ''}`;
                const category = item?.category || '';
                const groupId = contextId?.groupId || '';
                const Tags = `${category}`;
                const quoteString = contextId?.quoteString || '';
                const Quote = escapeString(`${quoteString}`);
                const Occurrence = `${contextId?.occurrence || ''}`;
                const SupportReference = `rc://*/ta/man/translate/${groupId}`
                const _note = contextId?.occurrenceNote || '';
                const Note = `${_note}`;
                const selections = item?.selections ? escapeString(JSON.stringify(item?.selections)) : ''
                const comments = escapeString(item?.comments)
                const bookmarks = item?.reminder ? '1' : '0'
                const verseEdits = item?.verseEdits ? '1' : '0'
                const invalidated = item?.invalidated ? '1' : '0'

                rows.push(
                  {
                      Reference, chapter, verse, ID, Tags, SupportReference, Quote, Occurrence, Note, selections, comments, bookmarks, verseEdits, invalidated
                  },
                )
            }
        }
        
        const _rows = sortRowsByRef(rows);
        twl = _rows.map(r => arrayToTsvLine([
            // @ts-ignore
            r.Reference,  r.ID, r.Tags, r.SupportReference, r.Quote, r.Occurrence, r.Note, r.selections, r.comments, r.bookmarks, r.verseEdits, r.invalidated
        ]))
        const keys = [
            'Reference', 'ID', 'Tags', 'SupportReference', 'Quote', 'Occurrence', 'Note', 'selections', 'comments', 'bookmarks', 'verseEdits', 'invalidated'
        ];
        twl.unshift(arrayToTsvLine(keys))

        results = twl.join('\n')
    }
    return results
}

export async function changeTargetVerse(projectPath:string, bookId:string, chapter:string, verse:string, newVerseText:string, newVerseObjects: object) {
    if (projectPath && bookId && chapter && verse) {
        const filePath = path.join(projectPath, 'targetBible', bookId, `${chapter}.json`)
        const chapterData = readJsonFile(filePath);
        if (chapterData) {
            chapterData[verse] = { verseObjects: newVerseObjects }
            fs.outputJsonSync(filePath, chapterData, { spaces: 2 });
        } else {
            console.warn (`changeTargetVerse() missing chapter:`, { projectPath, bookId, chapter: chapterData, verse})
        }
    } else {
        console.warn (`changeTargetVerse() missing parameters:`, { projectPath, bookId, chapter, verse, newVerseText})
    }
}

/**
 * Returns the original language version number needed for tn's group data files.
 * @param {array} tsvRelations
 * @param {string} resourceId
 */
export function getTsvOLVersion(tsvRelations:string[], resourceId:string) {
    try {
        let tsvOLVersion = null;

        if (tsvRelations) {
            // Get the query string from the tsv_relation array for given resourceId
            const query = tsvRelations.find((query) => query.includes(resourceId));

            if (query) {
                // Get version number from query
                tsvOLVersion = query.split('?v=')[1];
            }
        }
        return tsvOLVersion;
    } catch (error) {
        console.error(error);
    }
}

export function getTsvOLVersionForBook(tsvRelations:string[], bookId:string) {
    const _isNT = isNT(bookId)
    const bibleId = _isNT ? NT_ORIG_LANG_BIBLE : OT_ORIG_LANG_BIBLE
    const version = getTsvOLVersion(tsvRelations, bibleId)
    return { bibleId, version }
}

export function getServer() {
    return apiHelpers.DCS_BASE_URL
}
