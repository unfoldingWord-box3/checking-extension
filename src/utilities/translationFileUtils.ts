// @ts-ignore
import * as fs from "fs-extra";
import * as path from "path";
import {
  addAlignmentsForBibleBook,
  addAlignmentsForCheckingData,
  AlignmentMapType
} from "./shared/translationUtils";
import { isNT } from "./BooksOfTheBible";
import { getParsedUSFM } from "./resourceUtils";
import { getAllFiles } from "./fileUtils";

/**
 * Extracts translations from files within a specified project folder recursively and updates the alignment map with the parsed data.
 * It processes `.usfm` files and `_check` files based on the provided parameters.
 *
 * @param {string} projectFolder - The folder containing the files to be processed.
 * @param {boolean} doNT - Flag indicating whether to process New Testament files. If true, filters New Testament files; otherwise, filters Old Testament files.
 * @param {AlignmentMapType} alignmentMap_ - The alignment map object to be updated with extracted translations or alignment data.
 * @return {void} This function does not return a value. It updates the alignment map in place.
 */
export function getTranslationsFromFolder(projectFolder: string, doNT: boolean, alignmentMap_: AlignmentMapType) {
  const files = getAllFiles(projectFolder);
  for (const file of files) {
    if (file.endsWith(".usfm")) {
      const baseFileName = path.parse(file).name;

      const bookId = baseFileName.split("-")[1]?.toLowerCase();

      if (isNT(bookId) != doNT) {
        continue;
      }
      const usfm = fs.readFileSync(path.join(projectFolder, file), "UTF-8")?.toString() || "";
      const bookJson = getParsedUSFM(usfm);
      
      addAlignmentsForBibleBook(bookJson, bookId, alignmentMap_);
    } else if (file.endsWith("_check")) {
      const baseFileName = path.parse(file).name;

      const bookId = baseFileName.split(".")[0]?.toLowerCase();

      if (isNT(bookId) != doNT) {
        continue;
      }
      const checkingData = fs.readJsonSync(path.join(projectFolder, file));
      
      addAlignmentsForCheckingData(checkingData, bookId, alignmentMap_);
    }
  }
}
