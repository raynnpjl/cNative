import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { JsonConfigStore } from '../src/config/config.store.js';
import { TmdbCredentialsStore } from '../src/config/tmdb-credentials.store.js';
import { TmdbClient } from '../src/providers/tmdb/tmdb.client.js';
import { buildDiscoverQuery } from '../src/catalogs/discover-query.builder.js';
import { IdResolver } from '../src/ids/id-resolver.service.js';
import { measureCoverage } from '../src/metadata/coverage.js';

try {
  const { values } = parseArgs({ options: { limit: { type: 'string', default: '20' }, ids: { type: 'string' }, output: { type: 'string' } } });
  const limit = z.coerce.number().int().min(1).max(100).parse(values.limit);
  const credentials = (await TmdbCredentialsStore.open(`${process.env.CONFIG_PATH ?? '/data/config.json'}.tmdb.json`)).get();
  if (!credentials) throw new Error('Save your TMDB API key in General Settings before measuring live metadata coverage.');
  const tmdb = new TmdbClient(credentials);
  const resolver = new IdResolver(tmdb);
  let ids: number[] = [];
  if (values.ids) {
    for (const input of values.ids.split(',').slice(0, limit)) {
      const id = await resolver.toTmdbId(/^\d+$/.test(input.trim()) ? `tmdb:${input.trim()}` : input.trim());
      if (id === null) throw new Error(`No TMDB TV match for ${input}`);
      ids.push(id);
    }
  } else {
    const config = await (await JsonConfigStore.open(process.env.CONFIG_PATH ?? '/data/config.json')).get();
    const catalog = config.catalogs.find(catalog => catalog.enabled);
    if (!catalog) throw new Error('Enable a catalog or pass --ids=tmdb:123,tt1234567');
    for (let page = 1; ids.length < limit; page++) {
      const result = await tmdb.discover({ ...buildDiscoverQuery(catalog, page), include_adult: config.includeAdult });
      ids.push(...result.results.map(show => show.id));
      if (page >= result.total_pages || !result.results.length) break;
    }
    ids = ids.slice(0, limit);
  }
  if (!ids.length) throw new Error('No series found for this sample.');
  const report = await measureCoverage(tmdb, ids);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (values.output) await writeFile(values.output, json, 'utf8');
  process.stdout.write(json);
  if (report.failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Coverage measurement failed');
  process.exitCode = 1;
}
