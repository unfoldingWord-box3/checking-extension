

export const AIPromptTemplate =
`Using the following translation data, identify words in the provided Translated text that correspond to translations of \`{sourceWord}\`. Return your results in CSV format with columns for "sourceText", “translatedText" and “score”:

Translation Data:
{translationCsv}


Translated Text
\`\`\`
{translatedText}
\`\`\`

Ensure the CSV output is structured with columns of:
\`translatedText,sourceText,score\`

Provide only the translations that appear in the text.`