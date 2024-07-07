import * as languagesList from "../data/languagesList";

export const getLanguage = (languageId:string) => {
  let _language
  languageId = languageId.toLowerCase()
  const language = languagesList.languages.find(item => {
    // @ts-ignore
    return item.lc?.toLowerCase() === languageId // compare lower case
  })
  // @ts-ignore
  _language = formatLanguage( language )
  return _language
}

export const getLanguageName = (languageId:string) => {
  const language = getLanguage(languageId )
  // @ts-ignore
  const languageName = language ? language.ln : null
  return languageName
}

export const getLanguages = () => {
  const _languages = languagesList.languages.map(language => formatLanguage(language))
  return _languages
}

export const getLanguagePrompts = (languages:object[] = languagesList.languages) => {
  const _languages:string[] = languages.map(language => {
    // @ts-ignore
    const langName = language.languageName || language.localized || language.languageId;
    // @ts-ignore
    const langPrompt = `${language.languageId} ${langName}`;
    return langPrompt
  })
  return _languages
}

export const getLanguageCodeFromPrompts = (match:string) => {
  const languageId = match ? match.split(' ')[0] : null
  return languageId
}

export const getGatewayLanguages = () => {
  const _languages = languagesList.languages
    // @ts-ignore
    .filter(language => language.gw)
    .map(language => formatLanguage(language))
  return _languages
}

export const formatLanguage = ( language:object ) => {
  let _language = {}
  if (language) {
    _language = {
      // @ts-ignore
      id: language.pk,
      // @ts-ignore
      languageId: language.lc,
      // @ts-ignore
      languageName: language.ang,
      // @ts-ignore
      region: language.lr,
      // @ts-ignore
      gateway: language.gw,
      // @ts-ignore
      country: language.hc,
      // @ts-ignore
      localized: language.ln,
      // @ts-ignore
      direction: language.ld,
      // @ts-ignore
      aliases: language.alt,
      // @ts-ignore
      countries: language.cc,
    }
  }
  return _language
}

export const languages = getLanguages()
export const gatewayLanguages = getGatewayLanguages()
