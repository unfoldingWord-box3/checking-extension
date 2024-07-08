// @ts-ignore
import * as path from 'path';
// @ts-ignore
import * as ospath from 'ospath';
import { ResourcesObject } from "../../types";
import { loadResourcesFromPath } from "./checkerFileUtils";

const workingPath = path.join(ospath.home(), 'translationCore')
const projectsPath = path.join(workingPath, 'otherProjects')
const resourcesPath = path.join(projectsPath, 'cache')


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
