import * as languagesList from "../data/languagesList";
const { locales } = require('../data/locales/locales')

export const DEFAULT_LOCALE = 'en'
export const LOCALE_KEY = 'LOCALE_CDOE'

let translations: object = { }
let currentLocale:object = { };
let currentLanguageCode: string|null = null

export const getCurrentLocale = () => {
  return currentLocale
}

export function getLocales() {
  return locales;
}

export const getCurrentLanguageCode = () => {
  return currentLanguageCode
}

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

/**
 * This parses localization data if not already parsed.
 */
export function loadLocalization():void {
  // check if already initialized
  if (translations && Object.keys(translations).length) {
    return
  }

  const _locales = getLocales();
  const keys = Object.keys(_locales)
  if (!keys?.length) {
    console.error(`loadLocalization - locales not loaded`);
    return
  }

  for (let key of keys) {
    try {
      let translation = _locales[key];
      translation = enhanceTranslation(translation, key);

      const { langCode, shortLangCode } = explodeLocaleName(key);
      // @ts-ignore
      translations[langCode] = translation;

      // include short language names for wider locale compatibility
      // @ts-ignore
      if (!translations[shortLangCode]) {
        // @ts-ignore
        translations[shortLangCode] = translation;
      }
    } catch (e) {
      console.error(`loadLocalization() - Failed to load localization ${key}: ${e}`);
    }
  }
}

/**
 * find localization data that matches code, or will fall back to default
 * @param languageCode
 */
export function setLocale(languageCode:string) {
  loadLocalization() // make sure initialized
  // @ts-ignore
  if (translations[languageCode]) {
    // @ts-ignore
    currentLocale = translations[languageCode]
    currentLanguageCode = languageCode
  } else
  if (languageCode) {
    console.log(`setLocale() - No exact match found for ${languageCode}`);
    const shortLocale = languageCode.split('_')[0];
    // @ts-ignore
    const equivalentLocale = translations[shortLocale]?.['_']?.['locale'];

    if (equivalentLocale) {
      console.log(`setLocale() - Falling back to ${equivalentLocale}`);
      currentLanguageCode = equivalentLocale;
      // @ts-ignore
      currentLocale = translations[shortLocale]
    } else {
      currentLanguageCode = DEFAULT_LOCALE; // default to `en` if shortLocale match not found
      // @ts-ignore
      currentLocale = translations[currentLanguageCode]
      console.log(`setLocale() - No short match found for ${shortLocale}, Falling back to ${languageCode}`);
    }
  }
}

/**
 * Splits a locale fullName into it's identifiable pieces
 * @param {string} fullName the locale name
 * @return {{langName, langCode, shortLangCode}}
 */
export const explodeLocaleName = (fullName:string) => {
  let title = fullName.replace(/\.json/, '');
  const parts = title.split('-')
  let langCode = parts.pop() || '';
  let langName = parts.join('-');
  let shortLangCode = langCode.split('_')[0];
  return {
    langName, langCode, shortLangCode,
  };
};

/**
 * Injects additional information into the translation
 * that should not otherwise be translated. e.g. legal entities
 * @param {object} translation localized strings
 * @param {string} fullName the name of the locale.
 * @param {array} nonTranslatableStrings a list of non-translatable strings to inject
 * @return {object} the enhanced translation
 */
export const enhanceTranslation = (translation:object, fullName:string, nonTranslatableStrings = []) => {
  const {
    langName, langCode, shortLangCode,
  } = explodeLocaleName(fullName);
  return {
    ...translation,
    '_': {
      'language_name': langName,
      'short_locale': shortLangCode,
      'locale': langCode,
      'full_name': fullName,
      ...nonTranslatableStrings,
    },
  };
};

