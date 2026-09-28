import { expect, it } from 'vitest';
import { measureCoverage } from '../addon/src/metadata/coverage.js';
import { tmdbFixture } from './fixtures.js';

it('measures raw Chinese coverage and reports failed series separately', async () => {
  const { client } = tmdbFixture();
  const report = await measureCoverage(client, [101, 101, 999]);
  expect(report.requestedSeries).toBe(2);
  expect(report.summary.chineseTitles).toEqual({ available: 1, total: 1, percent: 100 });
  expect(report.summary.chineseSynopses.percent).toBe(100);
  expect(report.summary.chineseEpisodeTitles).toEqual({ available: 1, total: 1, percent: 100 });
  expect(report.summary.chineseEpisodeOverviews.percent).toBe(100);
  expect(report.summary.imdbMappings.percent).toBe(100);
  expect(report.failures[0]?.id).toBe(999);
});
