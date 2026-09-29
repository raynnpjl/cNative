import type { DisplayLanguage, DisplayLanguages } from '../../../shared/config.js';

export const CNATIVE_ID_PREFIX = 'cnative:';

export function metadataId(externalId: string, languages: DisplayLanguages): string {
  const codes = [languages.titleLanguage, languages.synopsisLanguage, languages.episodeNameLanguage]
    .map(language => language.slice(0, 2)).join('-');
  return `${CNATIVE_ID_PREFIX}${codes}:${externalId}`;
}

export function parseMetadataId(id: string): { externalId: string; languages: DisplayLanguages } | null {
  const match = /^cnative:(zh|en)-(zh|en)-(zh|en):(tt\d{7,}|tmdb:[1-9]\d*)$/.exec(id);
  if (!match) return null;
  const locale = (code: string): DisplayLanguage => code === 'en' ? 'en-US' : 'zh-CN';
  return {
    externalId: match[4]!,
    languages: { titleLanguage: locale(match[1]!), synopsisLanguage: locale(match[2]!), episodeNameLanguage: locale(match[3]!) },
  };
}
