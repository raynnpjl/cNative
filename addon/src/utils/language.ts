const chineseLanguages = new Set(['zh', 'cn', 'yue', 'cmn', 'nan', 'hak']);
const chineseOrigins = new Set(['CN', 'HK', 'TW', 'MO']);

export function isChineseLanguage(language: string): boolean {
  return chineseLanguages.has(language.toLowerCase());
}

export function isChineseSeries(show: { original_language: string; origin_country?: string[] }): boolean {
  return isChineseLanguage(show.original_language) || Boolean(show.origin_country?.some(code => chineseOrigins.has(code)));
}

export function hasChineseText(value: string | null | undefined): boolean {
  return Boolean(value && /\p{Script=Han}/u.test(value));
}
