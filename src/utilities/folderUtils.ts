// @ts-ignore
import fs from 'fs-extra'
// @ts-ignore
import path from 'path-extra'

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

export function readHelpsFolder(folderPath:string, filterBook:string = '') {
  const contents = {}
  const files = fs.readdirSync(folderPath)
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const key = path.base(file)
    const type = path.extname(file)
    if (type === '.json') {
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
        const data = readHelpsFolder(bookPath)
        // @ts-ignore
        contents[key] = data
      } else {
        const data = readHelpsFolder(filePath, filterBook)
        // @ts-ignore
        contents[key] = data
      }
    }
  }
  return contents
}
