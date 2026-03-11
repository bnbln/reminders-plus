import { NativeModules, Settings } from 'react-native';

import { TRANSLATIONS } from './locales';
import type { AppLocale, TranslationParams } from './types';

export type { AppLocale } from './types';

const SUBTASK_TRANSLATIONS: Record<
  AppLocale,
  {
    menu: string;
    withSubtasks: string;
    withSubtasksOnly: string;
  }
> = {
  de: {
    menu: 'Unteraufgaben',
    withSubtasks: 'Mit Unteraufgaben',
    withSubtasksOnly: 'Unteraufgaben kompakt anzeigen',
  },
  en: {
    menu: 'Subtasks',
    withSubtasks: 'With subtasks',
    withSubtasksOnly: 'Show compact subtasks',
  },
  es: {
    menu: 'Subtareas',
    withSubtasks: 'Con subtareas',
    withSubtasksOnly: 'Mostrar subtareas compactas',
  },
  fr: {
    menu: 'Sous-tâches',
    withSubtasks: 'Avec sous-tâches',
    withSubtasksOnly: 'Afficher les sous-tâches compactes',
  },
  pt: {
    menu: 'Subtarefas',
    withSubtasks: 'Com subtarefas',
    withSubtasksOnly: 'Mostrar subtarefas compactas',
  },
  hi: {
    menu: 'उप-कार्य',
    withSubtasks: 'उप-कार्यों के साथ',
    withSubtasksOnly: 'कॉम्पैक्ट उप-कार्य दिखाएँ',
  },
  zh: {
    menu: '子任务',
    withSubtasks: '含子任务',
    withSubtasksOnly: '显示紧凑子任务',
  },
  ja: {
    menu: 'サブタスク',
    withSubtasks: 'サブタスクあり',
    withSubtasksOnly: 'サブタスクをコンパクト表示',
  },
  it: {
    menu: 'Sottoattività',
    withSubtasks: 'Con sottoattività',
    withSubtasksOnly: 'Mostra sottoattività compatte',
  },
  sv: {
    menu: 'Deluppgifter',
    withSubtasks: 'Med deluppgifter',
    withSubtasksOnly: 'Visa kompakta deluppgifter',
  },
  da: {
    menu: 'Underopgaver',
    withSubtasks: 'Med underopgaver',
    withSubtasksOnly: 'Vis kompakte underopgaver',
  },
  fi: {
    menu: 'Alatehtävät',
    withSubtasks: 'Alatehtävillä',
    withSubtasksOnly: 'Näytä kompaktit alatehtävät',
  },
  pl: {
    menu: 'Podzadania',
    withSubtasks: 'Z podzadaniami',
    withSubtasksOnly: 'Pokaż podzadania w formie kompaktowej',
  },
  nl: {
    menu: 'Subtaken',
    withSubtasks: 'Met subtaken',
    withSubtasksOnly: 'Compacte subtaken tonen',
  },
  tr: {
    menu: 'Alt görevler',
    withSubtasks: 'Alt görevli',
    withSubtasksOnly: 'Kompakt alt görevleri göster',
  },
  cs: {
    menu: 'Podúkoly',
    withSubtasks: 'S podúkoly',
    withSubtasksOnly: 'Zobrazit kompaktní podúkoly',
  },
  hu: {
    menu: 'Részfeladatok',
    withSubtasks: 'Részfeladatokkal',
    withSubtasksOnly: 'Kompakt részfeladatok megjelenítése',
  },
  ro: {
    menu: 'Subtaskuri',
    withSubtasks: 'Cu subtaskuri',
    withSubtasksOnly: 'Afișează subtaskuri compacte',
  },
  el: {
    menu: 'Υποεργασίες',
    withSubtasks: 'Με υποεργασίες',
    withSubtasksOnly: 'Εμφάνιση συμπαγών υποεργασιών',
  },
  id: {
    menu: 'Subtugas',
    withSubtasks: 'Dengan subtugas',
    withSubtasksOnly: 'Tampilkan subtugas ringkas',
  },
  vi: {
    menu: 'Nhiệm vụ con',
    withSubtasks: 'Có nhiệm vụ con',
    withSubtasksOnly: 'Hiển thị nhiệm vụ con dạng gọn',
  },
  ko: {
    menu: '하위 작업',
    withSubtasks: '하위 작업 포함',
    withSubtasksOnly: '하위 작업 간략히 표시',
  },
  uk: {
    menu: 'Підзадачі',
    withSubtasks: 'З підзадачами',
    withSubtasksOnly: 'Показувати компактні підзадачі',
  },
  ru: {
    menu: 'Подзадачи',
    withSubtasks: 'С подзадачами',
    withSubtasksOnly: 'Показывать подзадачи компактно',
  },
  ar: {
    menu: 'المهام الفرعية',
    withSubtasks: 'مع المهام الفرعية',
    withSubtasksOnly: 'إظهار المهام الفرعية بشكل مضغوط',
  },
};

for (const locale of Object.keys(SUBTASK_TRANSLATIONS) as AppLocale[]) {
  const dict = TRANSLATIONS[locale];
  const values = SUBTASK_TRANSLATIONS[locale];
  dict['home.filter.subtasks'] = values.menu;
  dict['filters.withSubtasks'] = values.withSubtasks;
  dict['filters.withSubtasksOnly'] = values.withSubtasksOnly;
}

let localeOverride: AppLocale | null = null;

function normalizeLocaleTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/_/g, '-').toLowerCase();
}

type ExpoLocale = {
  languageTag?: string;
  languageCode?: string;
  regionCode?: string;
};

function localeFromNativeModules(): string | null {
  try {
    const settings = (NativeModules as any)?.SettingsManager?.settings ?? {};
    const iosLocale =
      settings.AppleLocale ??
      (Array.isArray(settings.AppleLanguages) ? settings.AppleLanguages[0] : undefined);
    const androidLocale =
      (NativeModules as any)?.I18nManager?.localeIdentifier ??
      settings.localeIdentifier;
    return normalizeLocaleTag(iosLocale ?? androidLocale);
  } catch {
    return null;
  }
}

function localeFromSettingsApi(): string | null {
  try {
    const fromAppleLocale = normalizeLocaleTag(Settings?.get?.('AppleLocale'));
    if (fromAppleLocale) return fromAppleLocale;
    const appleLanguages = Settings?.get?.('AppleLanguages');
    if (Array.isArray(appleLanguages) && appleLanguages.length > 0) {
      const fromLanguages = normalizeLocaleTag(appleLanguages[0]);
      if (fromLanguages) return fromLanguages;
    }
    return null;
  } catch {
    return null;
  }
}

function localeFromPlatformConstants(): string | null {
  try {
    const platformConstants = (NativeModules as any)?.PlatformConstants ?? {};
    const direct = normalizeLocaleTag(
      platformConstants?.localeIdentifier ??
      platformConstants?.locale ??
      platformConstants?.languageTag
    );
    if (direct) return direct;

    const locales = platformConstants?.locales;
    if (Array.isArray(locales) && locales.length > 0) {
      const first = locales[0];
      if (typeof first === 'string') return normalizeLocaleTag(first);
      return normalizeLocaleTag(first?.languageTag ?? first?.languageCode);
    }
    return null;
  } catch {
    return null;
  }
}

function localeFromNavigator(): string | null {
  try {
    const nav = (globalThis as any)?.navigator;
    const first = Array.isArray(nav?.languages) && nav.languages.length > 0 ? nav.languages[0] : nav?.language;
    return normalizeLocaleTag(first);
  } catch {
    return null;
  }
}

function localeFromIntl(): string | null {
  try {
    return normalizeLocaleTag(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

function mapLocaleTagToAppLocale(localeTag: string): AppLocale {
  if (localeTag.startsWith('de')) return 'de';
  if (localeTag.startsWith('es')) return 'es';
  if (localeTag.startsWith('fr')) return 'fr';
  if (localeTag.startsWith('pt')) return 'pt';
  if (localeTag.startsWith('hi')) return 'hi';
  if (localeTag.startsWith('zh')) return 'zh';
  if (localeTag.startsWith('ja')) return 'ja';
  if (localeTag.startsWith('it')) return 'it';
  if (localeTag.startsWith('sv')) return 'sv';
  if (localeTag.startsWith('da')) return 'da';
  if (localeTag.startsWith('fi')) return 'fi';
  if (localeTag.startsWith('pl')) return 'pl';
  if (localeTag.startsWith('nl')) return 'nl';
  if (localeTag.startsWith('tr')) return 'tr';
  if (localeTag.startsWith('cs')) return 'cs';
  if (localeTag.startsWith('hu')) return 'hu';
  if (localeTag.startsWith('ro')) return 'ro';
  if (localeTag.startsWith('el')) return 'el';
  if (localeTag.startsWith('id')) return 'id';
  if (localeTag.startsWith('vi')) return 'vi';
  if (localeTag.startsWith('ko')) return 'ko';
  if (localeTag.startsWith('uk')) return 'uk';
  if (localeTag.startsWith('ru')) return 'ru';
  if (localeTag.startsWith('ar')) return 'ar';
  return 'en';
}

function detectLocale(): AppLocale {
  const localeTag =
    localeFromNativeModules() ??
    localeFromSettingsApi() ??
    localeFromPlatformConstants() ??
    localeFromNavigator() ??
    localeFromIntl() ??
    'en';
  return mapLocaleTagToAppLocale(localeTag);
}

export function getLocale(): AppLocale {
  return localeOverride ?? detectLocale();
}

export function setLocale(locale: AppLocale | null) {
  localeOverride = locale;
}

export function getIntlLocale(locale: AppLocale = getLocale()): string {
  switch (locale) {
    case 'de':
      return 'de-DE';
    case 'es':
      return 'es-419';
    case 'fr':
      return 'fr-FR';
    case 'pt':
      return 'pt-BR';
    case 'hi':
      return 'hi-IN';
    case 'zh':
      return 'zh-CN';
    case 'ja':
      return 'ja-JP';
    case 'it':
      return 'it-IT';
    case 'sv':
      return 'sv-SE';
    case 'da':
      return 'da-DK';
    case 'fi':
      return 'fi-FI';
    case 'pl':
      return 'pl-PL';
    case 'nl':
      return 'nl-NL';
    case 'tr':
      return 'tr-TR';
    case 'cs':
      return 'cs-CZ';
    case 'hu':
      return 'hu-HU';
    case 'ro':
      return 'ro-RO';
    case 'el':
      return 'el-GR';
    case 'id':
      return 'id-ID';
    case 'vi':
      return 'vi-VN';
    case 'ko':
      return 'ko-KR';
    case 'uk':
      return 'uk-UA';
    case 'ru':
      return 'ru-RU';
    case 'ar':
      return 'ar';
    default:
      return 'en-US';
  }
}

const RTL_LOCALES: AppLocale[] = ['ar'];

export function isRtlLocale(locale: AppLocale = getLocale()): boolean {
  return RTL_LOCALES.includes(locale);
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = params[key];
    return value === undefined ? '' : String(value);
  });
}

export function t(key: string, params?: TranslationParams): string {
  const locale = getLocale();
  const value = TRANSLATIONS[locale][key] ?? TRANSLATIONS.en[key] ?? key;
  return interpolate(value, params);
}

export function formatDate(value: number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getIntlLocale(), options).format(date);
}

export function countLabel(count: number, oneKey: string, otherKey: string): string {
  return t(count === 1 ? oneKey : otherKey, { count });
}

