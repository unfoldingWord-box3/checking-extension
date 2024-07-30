// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import { basename } from "path";

function readJsonFile(jsonPath:string) {
  if (fs.existsSync(jsonPath)) {
    try {
      const resourceManifest = fs.readJsonSync(jsonPath);
      return resourceManifest;
    } catch (e) {
      console.error(`getLocalResourceList(): could not read ${jsonPath}`, e);
    }
  }
  return null;
}

function isDirectory(fullPath:string) {
  return fs.lstatSync(fullPath).isDirectory()
}

function readTextFile(filePath:string) {
  const data = fs.readFileSync(filePath, 'UTF-8').toString();
  return data
}

export function objectNotEmpty(data: {}) {
  return data && Object.keys(data).length;
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
