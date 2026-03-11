import type { AppLocale, TranslationDict } from '../types';

import { DE_TRANSLATIONS } from './de';
import { EN_TRANSLATIONS } from './en';
import { ES_TRANSLATIONS } from './es';
import { FR_TRANSLATIONS } from './fr';
import { PT_TRANSLATIONS } from './pt';
import { HI_TRANSLATIONS } from './hi';
import { ZH_TRANSLATIONS } from './zh';
import { JA_TRANSLATIONS } from './ja';
import { IT_TRANSLATIONS } from './it';
import { SV_TRANSLATIONS } from './sv';
import { DA_TRANSLATIONS } from './da';
import { FI_TRANSLATIONS } from './fi';
import { PL_TRANSLATIONS } from './pl';
import { NL_TRANSLATIONS } from './nl';
import { TR_TRANSLATIONS } from './tr';
import { CS_TRANSLATIONS } from './cs';
import { HU_TRANSLATIONS } from './hu';
import { RO_TRANSLATIONS } from './ro';
import { EL_TRANSLATIONS } from './el';
import { ID_TRANSLATIONS } from './id';
import { VI_TRANSLATIONS } from './vi';
import { KO_TRANSLATIONS } from './ko';
import { AR_TRANSLATIONS } from './ar';
import { UK_TRANSLATIONS } from './uk';
import { RU_TRANSLATIONS } from './ru';

export const TRANSLATIONS: Record<AppLocale, TranslationDict> = {
  de: DE_TRANSLATIONS,
  en: EN_TRANSLATIONS,
  es: ES_TRANSLATIONS,
  fr: FR_TRANSLATIONS,
  pt: PT_TRANSLATIONS,
  hi: HI_TRANSLATIONS,
  zh: ZH_TRANSLATIONS,
  ja: JA_TRANSLATIONS,
  it: IT_TRANSLATIONS,
  sv: SV_TRANSLATIONS,
  da: DA_TRANSLATIONS,
  fi: FI_TRANSLATIONS,
  pl: PL_TRANSLATIONS,
  nl: NL_TRANSLATIONS,
  tr: TR_TRANSLATIONS,
  cs: CS_TRANSLATIONS,
  hu: HU_TRANSLATIONS,
  ro: RO_TRANSLATIONS,
  el: EL_TRANSLATIONS,
  id: ID_TRANSLATIONS,
  vi: VI_TRANSLATIONS,
  ko: KO_TRANSLATIONS,
  ar: AR_TRANSLATIONS,
  uk: UK_TRANSLATIONS,
  ru: RU_TRANSLATIONS,
};

export default TRANSLATIONS;
