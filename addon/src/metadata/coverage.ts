import type { TmdbClient } from '../providers/tmdb/tmdb.client.js';
import { hasChineseText } from '../utils/language.js';
import { isImdbId } from '../ids/id-resolver.service.js';

export async function measureCoverage(tmdb: TmdbClient, ids: number[]) {
  const rows = [];
  const failures: { id: number; error: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const show = await tmdb.series(id);
      const seasons = await Promise.all(show.seasons.filter(season => season.season_number > 0).map(season => tmdb.season(id, season.season_number)));
      const episodes = seasons.flatMap(season => season.episodes);
      rows.push({
        id, name: show.original_name || show.name || '',
        chineseTitle: hasChineseText(show.original_name) || hasChineseText(show.name),
        chineseSynopsis: hasChineseText(show.overview),
        imdbMapping: Boolean(show.external_ids.imdb_id && isImdbId(show.external_ids.imdb_id)),
        episodes: episodes.length,
        chineseEpisodeTitles: episodes.filter(episode => hasChineseText(episode.name)).length,
        chineseEpisodeOverviews: episodes.filter(episode => hasChineseText(episode.overview)).length,
      });
    } catch (error) { failures.push({ id, error: error instanceof Error ? error.message : 'Unknown error' }); }
  }
  const totalEpisodes = rows.reduce((sum, row) => sum + row.episodes, 0);
  const metric = (available: number, total: number) => ({ available, total, percent: total ? Math.round(available / total * 1000) / 10 : null });
  return {
    generatedAt: new Date().toISOString(), provider: 'TMDB', language: 'zh-CN',
    method: 'Chinese text availability is approximated by presence of Han characters in raw TMDB responses. This is not a translation-quality assessment. Generated episode fallback titles are not counted. Failed shows are reported separately and excluded from denominators.',
    requestedSeries: new Set(ids).size,
    summary: {
      chineseTitles: metric(rows.filter(row => row.chineseTitle).length, rows.length),
      chineseSynopses: metric(rows.filter(row => row.chineseSynopsis).length, rows.length),
      chineseEpisodeTitles: metric(rows.reduce((sum, row) => sum + row.chineseEpisodeTitles, 0), totalEpisodes),
      chineseEpisodeOverviews: metric(rows.reduce((sum, row) => sum + row.chineseEpisodeOverviews, 0), totalEpisodes),
      imdbMappings: metric(rows.filter(row => row.imdbMapping).length, rows.length),
    }, rows, failures,
  };
}
