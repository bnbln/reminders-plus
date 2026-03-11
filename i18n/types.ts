export type AppLocale =
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'pt'
  | 'hi'
  | 'zh'
  | 'ja'
  | 'it'
  | 'sv'
  | 'da'
  | 'fi'
  | 'pl'
  | 'nl'
  | 'tr'
  | 'cs'
  | 'hu'
  | 'ro'
  | 'el'
  | 'id'
  | 'vi'
  | 'ko'
  | 'uk'
  | 'ru'
  | 'ar';

export type TranslationParams = Record<string, string | number>;

export type TranslationDict = Record<string, string>;
