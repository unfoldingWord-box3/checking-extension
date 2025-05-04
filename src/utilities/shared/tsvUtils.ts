// @ts-ignore
import * as tsvparser from "uw-tsv-parser";

/**
 * Converts an array of objects into a tab-separated values (TSV) format based on the provided format specification.
 *
 * @param {Array<Object>} reposFormat - An array specifying the format of the output TSV, where each object contains a `key` for the property name and an optional `text` for the column header.
 * @param {Array<Object>} reposLines - An array of objects containing the data to be converted into TSV format.
 * @return {Array<string>} An array of strings representing the TSV lines, including the header row as the first element.
 */
export function objectToTsv(reposFormat:object[], reposLines:object[]) {
  const lines = [];
  let line = '';
  let columns = [];
  
  // write header
  for (const field of reposFormat) {
    // @ts-ignore
    const fieldKey = field.key;
    // @ts-ignore
    const fieldText = field.text;
    const value = fieldText || fieldKey;
    columns.push(value);
  }
  line = columns.join('\t');
  columns = [];

  lines.push(line);
  for (const repoline of reposLines) {
    let line = '';
    for (const field of reposFormat) {
      // @ts-ignore
      const fieldKey = field.key;
      // @ts-ignore
      let value = repoline[fieldKey];
      if (typeof(value) === 'object') {
        value = JSON.stringify(value);
      } else if ((value !== 0) && !value) {
        value = '';
      }
      columns.push(value);
    }
    line = columns.join('\t');
    lines.push(line);
  }
  return lines;
}

/**
 * Converts an array of objects into a tab-separated values (CSV) format based on the provided format specification.
 *
 * @param {Array<Object>} reposFormat - An array specifying the format of the output TSV, where each object contains a `key` for the property name and an optional `text` for the column header.
 * @param {Array<Object>} reposLines - An array of objects containing the data to be converted into TSV format.
 * @return {Array<string>} An array of strings representing the TSV lines, including the header row as the first element.
 */
export function objectToCsv(reposFormat:object[], reposLines:object[]) {
  const lines = [];
  let line = '';
  let columns = [];

  // write header
  for (const field of reposFormat) {
    // @ts-ignore
    const fieldKey = field.key;
    // @ts-ignore
    const fieldText = field.text;
    const value = fieldText || fieldKey;
    columns.push(value);
  }
  line = columns.join(',');
  columns = [];

  lines.push(line);
  for (const repoline of reposLines) {
    columns = [];
    for (const field of reposFormat) {
      // @ts-ignore
      const fieldKey = field.key;
      // @ts-ignore
      let value = repoline[fieldKey];
      if (typeof(value) === 'object') {
        value = JSON.stringify(value);
      } else if ((value !== 0) && !value) {
        value = '';
      }
      columns.push(value);
    }
    line = columns.join(',');
    lines.push(line);
  }
  return lines;
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

/**
 * process the CSV data into index files
 * @param {string} csvLines
 */
export function csvToObjects(csvLines:string) {
  const tsvLines = csvLines.replace(/,/g, '\t');
  try {
    const csvObjects = tsvToObjects(tsvLines);
    const csvItems = csvObjects.tsvItems;

    // remove double quotes
    for (const csvItem of csvItems) {
      for (const key of Object.keys(csvItem)) {
        const value = csvItem[key].trim();
        if (value.startsWith("\"") && value.endsWith("\"")) {
          csvItem[key] = value.substring(1, value.length - 1);
        }
      }
    }

    return {
      csvItems,
      parseErrorMsg: csvObjects.parseErrorMsg,
      error: csvObjects.error,
      expectedColumns: csvObjects.expectedColumns,
    };
  } catch (e) {
    console.warn(`csvToObjects() - error processing data:`, e);
    return {  }
  }
}
