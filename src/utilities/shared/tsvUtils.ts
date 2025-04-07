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

