// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "node:crypto";
// @ts-ignore
import { applyPatch, createPatch } from 'diff'

const SEP = path.sep || '/'

export function readJsonFile(jsonPath:string) {
  if (fs.existsSync(jsonPath)) {
    try {
      const jsonData = fs.readJsonSync(jsonPath);
      return jsonData;
    } catch (e) {
      console.error(`getLocalResourceList(): could not read ${jsonPath}`, e);
    }
  }
  return null;
}

export function isDirectory(fullPath:string) {
  return fs.lstatSync(fullPath).isDirectory()
}

export function readTextFile(filePath:string) {
  const data = fs.readFileSync(filePath, 'UTF-8').toString();
  return data
}

export function objectNotEmpty(data: {}) {
  return data && Object.keys(data).length;
}

export function fileExists(filePath:string) {
  return !!fs.existsSync(filePath)
}

function getSubPath(basePath:string, subPath:string):string {
  if (basePath) {
    return basePath + SEP + subPath
  }
  return subPath
}

export function getAllFiles(basePath: string, arrayOfFiles: string[] = [], subPath = ''): string[] {
  const currentPath = path.join(basePath, subPath);
  const files = fs.readdirSync(currentPath);

  files.forEach((file:string) => {
    const filePath = path.join(currentPath, file);
    const _subPath = getSubPath(subPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(basePath, arrayOfFiles, _subPath);
    } else {
      arrayOfFiles.push(_subPath);
    }
  });

  return arrayOfFiles;
}

export function getChecksum(filePath:string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    // @ts-ignore
    stream.on('data', (data) => {
      hash.update(data);
    });

    // @ts-ignore
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    // @ts-ignore
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * copy files from one folder to destination
 * @param sourcePath
 * @param destPath
 * @param files
 */
export function copyFiles(sourcePath: string, destPath: string, files: string[]) {
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
 * get list of files with extension of fileType
 * @param repoPath
 * @param fileType
 * @param bookId
 */
export function getFilesOfType(repoPath: string, fileType: string, bookId:string | null = null):string[] {
  if (fs.pathExistsSync(repoPath)) {
    return fs.readdirSync(repoPath).filter((filename: string) => {
      const fileNameLC = filename.toLowerCase();
      let validFile = path.extname(fileNameLC) === fileType;
      if (validFile && bookId) {
        validFile = fileNameLC.includes(bookId)
      }
      return validFile;
    });
  }
  return []
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

export function readHelpsFolder(folderPath:string, filterBook:string = '', ignoreIndex = false) {
  const contents = {}
  const files = (fs.existsSync(folderPath) && isDirectory(folderPath)) ? fs.readdirSync(folderPath) : []
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const parsed = path.parse(file)
    const key = parsed.name
    const type = parsed.ext
    const skipIndex = ignoreIndex && (key === 'index')
    if (type === '.json' && !skipIndex) {
      const data = readJsonFile(filePath)
      if (data) {
        // @ts-ignore
        contents[key] = data
      }
    } else if (type === '.md') {
      const data = readTextFile(filePath)
      if (data) {
        // @ts-ignore
        contents[key] = data
      }
    } else if (isDirectory(filePath)) {
      if ((key === 'groups') && filterBook) {
        const bookPath = path.join(filePath, filterBook)
        const data = readHelpsFolder(bookPath, '', ignoreIndex)
        if (objectNotEmpty(data)) {
          // @ts-ignore
          contents[key] = data;
        }
      } else {
        const data = readHelpsFolder(filePath, filterBook, ignoreIndex)
        if (objectNotEmpty(data)) {
          // @ts-ignore
          contents[key] = data
        }
      }
    }
  }
  return contents
}

/**
 * replace any characters that are not compatible with a json string content
 * @param {string} diffFile
 * @return {string} escaped text
 */
export function escapeJsonStringChars(diffFile:string) {
  let newDiff = diffFile.replaceAll('\\', '\\\\')
  newDiff = newDiff.replaceAll('\n\r', '\\n')
  newDiff = newDiff.replaceAll('\n', '\\n')
  newDiff = newDiff.replaceAll('"', '\\"')
  return newDiff
}

/**
 * create a patch of the differences between the contents of originalFile and editedFile
 * @param {string} fileName - name of the file being changed
 * @param {string} originalFileContents - original file contents
 * @param {string} editedFileContents - new file contents
 * @param {boolean} jsonEscape - if true then we escape characters to fit in json string contents
 * @param {number} contextLines - number of context lines to include in patch
 * @return {string} - differences between files
 */
export function getPatch(fileName:string, originalFileContents:string, editedFileContents:string, jsonEscape = false, contextLines = 4) {
  let diffResult = createPatch(fileName, originalFileContents, editedFileContents, undefined, undefined, { context: contextLines })

  if (jsonEscape) {
    diffResult = escapeJsonStringChars(diffResult)
  }
  return diffResult
}

/**
 * do URL path fixing
 * @param css - css content to clean up
 * @param runTimeFolder - path to current app folder
 */
export function fixUrls(css: string, runTimeFolder: string) {
  let changes = 0;
  const ASSETS = "/assets"
  const parts = css.split("url(");
  if (parts.length > 1) {
    // iterate through each URL
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const pathParts = part.split(")");
      // for assets, replace with absolute path to work with vscode
      const pos = pathParts[0].indexOf(ASSETS)
      
      if (pos >= 0) {
        const subPath = pathParts[0].substring(pos)
        const newUrlPath = path.join(runTimeFolder, subPath);
        const newUrlFsPath = newUrlPath.replaceAll("\\", "/");
        if (pathParts[0] !== newUrlFsPath) {
          changes++;
          console.log(`fixCSS - found ${pathParts[0]} and changed to ${newUrlFsPath}`);
          // replace asset path with absolute path
          pathParts[0] = newUrlFsPath;
          const joinedStr = pathParts.join(")");
          parts[i] = joinedStr;
        } else { // asset path is already absolute path
          // console.log(`fixCSS - valid URL ${pathParts[0]}`);
        }
      } else {
        // console.log(`fixCSS - invalid URL: url(pathParts[0])`);
      }
    }
  }
  const newCss = parts.join('url(');
  return { parts, changes, newCss };
}
