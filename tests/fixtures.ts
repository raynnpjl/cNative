import { vi } from 'vitest';
import { TmdbClient } from '../addon/src/providers/tmdb/tmdb.client.js';

export const chineseGenres = [{ id: 18, name: '剧情' }, { id: 35, name: '喜剧' }, { id: 9648, name: '悬疑' }];
const englishGenres = [{ id: 9648, name: 'Mystery' }, { id: 35, name: 'Comedy' }, { id: 18, name: 'Drama' }];
export const genres = [{ id: 18, name: '剧情 · Drama' }, { id: 35, name: '喜剧 · Comedy' }, { id: 9648, name: '悬疑 · Mystery' }];
export const show = {
  id: 101, name: '逐玉', original_name: '逐玉', original_language: 'zh', origin_country: ['CN'],
  overview: '这是 TMDB 中文剧情简介。', poster_path: '/poster.jpg', backdrop_path: '/background.jpg',
  first_air_date: '2026-03-01', genre_ids: [18], adult: false,
};
export const episode = { episode_number: 1, season_number: 1, name: '初见', overview: '相逢的故事。', air_date: '2026-03-01', runtime: 45, still_path: '/still.jpg' };
export const season = { season_number: 1, poster_path: '/season.jpg', episodes: [episode] };
export const logos = [
  { iso_639_1: 'en', file_path: '/english-logo.png', vote_average: 9, vote_count: 100 },
  { iso_639_1: 'zh', file_path: '/chinese-logo-low.png', vote_average: 5, vote_count: 1 },
  { iso_639_1: 'zh', file_path: '/chinese-logo.png', vote_average: 8, vote_count: 2 },
];
export const detail = {
  ...show, genres: chineseGenres, episode_run_time: [45], seasons: [{ season_number: 0 }, { season_number: 1 }],
  credits: { cast: [{ name: '演员甲' }] }, external_ids: { imdb_id: 'tt1234567' },
  images: { logos },
};
export const englishDetail = { ...detail, name: 'Pursuit of Jade', overview: 'An English synopsis.' };
export const englishSeason = { ...season, episodes: [{ ...episode, name: 'First Meeting', overview: 'An unexpected encounter.' }] };

export function tmdbFixture() {
  const urls: URL[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    urls.push(url);
    const path = url.pathname.replace('/3', '');
    let data: unknown;
    if (path === '/authentication') data = { success: true };
    else if (path === '/genre/tv/list') data = { genres: url.searchParams.get('language') === 'en-US' ? englishGenres : chineseGenres };
    else if (path === '/discover/tv') data = { page: Number(url.searchParams.get('page')), total_pages: 3, total_results: 60, results: Array.from({ length: 20 }, (_, i) => ({ ...show, id: 101 + i })) };
    else if (path === '/search/tv') data = { page: 1, total_pages: 1, total_results: 8, results: [
      show,
      { ...show, id: 102, origin_country: ['US'] },
      { ...show, id: 103, original_language: 'cn', origin_country: ['HK'] },
      { ...show, id: 104, original_language: 'en', origin_country: ['US', 'CN'] },
      { ...show, id: 105, origin_country: ['TW'] },
      { ...show, id: 106, origin_country: ['MO'] },
      { ...show, id: 107, origin_country: ['SG'] },
      { ...show, id: 108, origin_country: [] },
    ] };
    else if (/^\/tv\/1\d\d$/.test(path)) data = {
      ...(url.searchParams.get('language') === 'en-US' ? englishDetail : detail), id: Number(path.split('/')[2]),
      external_ids: { imdb_id: path === '/tv/101' ? 'tt1234567' : null },
    };
    else if (/^\/tv\/1\d\d\/season\/1$/.test(path)) data = url.searchParams.get('language') === 'en-US' ? englishSeason : season;
    else if (/^\/tv\/\d+\/images$/.test(path)) data = detail.images;
    else if (/^\/tv\/\d+\/external_ids$/.test(path)) data = { imdb_id: path === '/tv/101/external_ids' ? 'tt1234567' : null };
    else if (path === '/find/tt1234567') data = { tv_results: [{ id: 101 }], movie_results: [] };
    else if (path === '/find/tt9999999') data = { tv_results: [], movie_results: [{ id: 999 }] };
    else return new Response('{}', { status: 404 });
    return Response.json(data);
  });
  return { urls, fetcher, client: new TmdbClient({ token: 'test-token', fetcher }) };
}
