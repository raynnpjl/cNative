# cNative

A configurable, single-user Stremio metadata addon for Chinese TV dramas. TMDB is the **only** provider. cNative uses existing Chinese/native metadata and never translates or scrapes it.

Build catalogs with TMDB Discover, choose their order, and decide which appear on Stremio Home. A default catalog is created automatically, with Chinese original language, Drama (18), and popularity descending. The Drama filter keeps reality/news programs out of the starter shelf and can be removed in the editor.

## Run locally

Requires Node.js **22.12+** and a TMDB v3 API key from [TMDB API settings](https://www.themoviedb.org/settings/api). An API Read Access Token is optional. This is application API authentication; there is no TMDB user-account integration.

```sh
npm ci
```

Create `.env` from `.env.example` for local host, port, and configuration path settings. TMDB credentials are entered and saved through **General Settings** in the configuration UI; `TMDB_API_KEY` and `TMDB_READ_ACCESS_TOKEN` environment variables are no longer used.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:7000/configure/**. In **General Settings**, enter your **TMDB API key**, optionally enter a **Read access token**, and click **Save API key**. Both supplied credentials are validated with TMDB before saving. Then configure catalogs, save, and select **Install in Stremio**. You can also copy the manifest URL after saving. The install and copy controls stay disabled until an API key has been saved and there are no unsaved edits.

For development:

```sh
npm run dev
```

Backend: port 7000. Vite UI: **http://127.0.0.1:5173/configure/**. Install the backend’s port-7000 manifest in Stremio while developing.

Without saved credentials, the UI and config API still start. The manifest sets `configurationRequired: true`, so Stremio directs users to configure instead of install; lookup/catalog/metadata requests explain what is missing. A token alone cannot unlock installation. Invalid saved configuration or credentials fail startup without overwriting files.

Credentials are shared by this single-user server and stored separately in `${CONFIG_PATH}.tmdb.json` with owner-only permissions. They are never returned by the config/status APIs or included in the manifest or installation URL. Saving new credentials takes effect immediately and resets TMDB caches; no restart is needed. Saved fields appear empty on reload. To replace credentials, enter the API key again; leaving the optional token blank removes the saved token. A failed validation or save keeps the last working credentials.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `CONFIG_PATH` | `/data/config.json` | Atomic JSON configuration file |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `7000` | HTTP port |

For local development, set `CONFIG_PATH=./data/config.json` in `.env`. Without this setting, the default is `/data/config.json`; the process must have write permission to its directory. Saves are validated, serialized, written to a unique temporary file, synced, and atomically renamed. The store is behind a small `ConfigStore` interface.

This is a single-user service with no public accounts or authentication. Keep the configuration interface/API private. If serving the read-only addon publicly, expose `/manifest.json`, `/catalog/*`, and `/meta/*` through an HTTPS reverse proxy and restrict `/configure/*` and `/api/*` to your trusted network. Stremio protocol responses allow CORS; config endpoints do not. JSON writes reject cross-origin browser requests. These measures are not a replacement for access control.

### Docker

```sh
docker compose up --build -d
```

Compose reads server settings from `.env`, persists configuration and saved credentials in the `/data` volume, and binds the host port to localhost. Enter TMDB credentials through the configuration UI after startup. Adjust the binding/reverse proxy for your private network. Container tooling is optional; local Node.js works independently.

## General settings

- **Metadata language:** fixed to `zh-CN`.
- **Chinese title mode:** native/original title by default; optionally use TMDB’s Chinese-localized name.
- **Adult content:** off by default; controls `include_adult` and detailed metadata visibility.
- **Search scope:** Chinese content by default; optionally all TV series.

Chinese-language series use `original_name` in native title mode. Other series use the `zh-CN` name, then `original_name`. Descriptions use the exact `overview` from the `zh-CN` request; missing descriptions remain empty. No English description fetch or translation fallback exists.

Search recognizes Chinese language codes (including TMDB’s `zh` and `cn`) **or** Chinese origin (`CN`, `HK`, `TW`, `MO`). Mandarin Singapore productions qualify through language; Singapore origin alone does not imply Chinese content.

## Catalog builder

Add, edit, duplicate, delete (with undo), enable/disable, drag to reorder, or use keyboard-accessible up/down buttons. Display-name changes keep the catalog ID. Duplicates receive a new ID. Click **Apply catalog**, then **Save configuration** to persist.

| Filter | TMDB parameter |
| --- | --- |
| Origin country | `with_origin_country` |
| Original language | `with_original_language` |
| Include genres | `with_genres`, pipe separated IDs; a show can match any selected genre |
| Exclude genres | `without_genres` |
| Sort | `sort_by` |
| Minimum / maximum rating | `vote_average.gte` / `vote_average.lte` |
| Minimum votes | `vote_count.gte` |
| First air date from / to | `first_air_date.gte` / `first_air_date.lte` |
| Runtime min / max | `with_runtime.gte` / `with_runtime.lte` |
| Released only | Upper first-air-date capped at today (UTC); unknown dates excluded |

Eight sorts: popularity, rating, first-air-date and vote count, each ascending/descending. Countries, languages, and TV genre labels are loaded from TMDB. Genres display Chinese and English together, such as `剧情 · Drama`, matched by TMDB genre ID. Selecting several genres includes shows matching at least one of them; there is no match-mode setting. Leave the genre selection empty to allow all genres. Original language controls **which shows** are selected; metadata language controls **how metadata is returned**. Chinese (`zh`) is the default original-language filter. The Hong Kong preset uses Cantonese (`cn`); choose Any language for broader regional coverage.

TMDB TV genres differ from movie genres. For example, a standalone “Romance” genre may not exist in the TV genre list. cNative presents only TMDB’s actual TV choices.

TMDB can still return English genre labels for entries without a Chinese label, even with `language=zh-CN` (observed for `Sci-Fi & Fantasy` and `War & Politics`). They are preserved exactly as supplied, never translated by cNative.

### Stremio protocol behavior

- Enabled catalogs appear in configured order. Disabled catalogs are omitted and return no results.
- Hidden Home catalogs require the `genre` extra, so they remain in Discover. **全部 · All** means the catalog’s configured filters without an additional genre restriction.
- Catalogs with zero or one included genre can use an additional Stremio genre to narrow results upstream.
- For a catalog with multiple included genres, the Stremio genre menu contains only those included genres. Selecting one narrows the union to that genre. cNative does not invent unsupported grouped boolean query syntax or filter Discover results after fetching.
- Discover uses TMDB’s 20-item pages: `page = floor(skip / 20) + 1`. Non-aligned offsets slice only the remainder of that single upstream page. Requests beyond TMDB’s 500-page ceiling return an empty list.
- Search is a separate, search-only catalog. It queries `/search/tv` without translating the query, then applies the configured Chinese-content scope. V1 returns the first upstream search page (up to 20 results before scope filtering); it does not advertise `skip` for search. This avoids mapping a filtered result count to the wrong TMDB page. Discover catalogs support full pagination independently.
- Stremio may cache installed manifests. After changing names, order, visibility or enabled catalogs, remove/reinstall the addon from the same manifest URL to refresh its layout.
- Catalog, search and detailed metadata use `cnative:tt1234567` when IMDb is available, otherwise `cnative:tmdb:123`. The manifest advertises metadata for `cnative:` IDs so other providers do not replace Chinese details. Each response also supplies `tmdb_id` and, when available, `imdb_id` as separate identifiers for client rating lookups and matching. Episodes retain standard `tt1234567:1:1` or `tmdb:123:1:1` IDs. cNative only queries TMDB and does not supply an IMDb rating.
- Only regular seasons are loaded. Empty/non-Chinese episode names fall back to `第 N 集`. Existing overview, runtime, air date and still are retained. Unknown air dates are omitted rather than invented; some Stremio clients may omit undated episodes. Season posters are included as an optional `seasonPoster` extension; client support varies.
- Missing posters/backgrounds/stills are omitted; no URLs contain `null` or `undefined`. Detail metadata does not label TMDB ratings as IMDb ratings.
- Catalog/search previews and detailed metadata supply Stremio's `logo` field from existing TMDB Chinese title artwork. Details append images to the cached `zh-CN` series request; previews use the cached TV images endpoint. Both use `include_image_language=zh`. Optional artwork failures do not hide catalog results. The highest-rated usable Chinese logo is selected, with vote count breaking ties; SVG paths request TMDB's PNG rendering. The text `name` is always retained for accessibility and client fallback. When Chinese artwork is absent, untagged, or invalid, `logo` is omitted so the client can display the title as text. English artwork is not substituted.
- Use the **cNative · 华语搜索** search row for native titles. Other addons may independently show English results for the same query; cNative cannot rename those results.

### Updating to separate metadata and rating IDs

Save your TMDB API key through General Settings, then remove and reinstall cNative using the same manifest URL to load version 1.0.4 with the name **cNative**. Restart the client and reopen its catalog or **cNative**. Shared IMDb entries from version 1.0.2 remain separate from cNative's metadata IDs. The addon does not rewrite your library or watch history.

cNative returns Chinese titles, descriptions, logos and episodes under its own IDs. Clients must explicitly support the separate `imdb_id` field to use their own rating lookup for these entries; unmodified clients that only recognize primary IMDb IDs may show no badge. Titles without an IMDb mapping also have no IMDb badge. The coordinated Harbor changes live in the separate Harbor source project; no client source or builds are bundled into cNative.

### Client search behavior

cNative controls the titles, metadata and results returned by its own **cNative · 华语搜索** catalog. The updated Harbor client prefers an exact cNative title match or the cNative entry for the same show identified by IMDb/TMDB IDs, and deduplicates those entries. Without cNative installed, Harbor uses its usual providers. This ranking is implemented in Harbor; other clients choose their own global Top match.

Searching the addon directly for `逐玉` or `Pursuit of Jade` returns the native title `逐玉` when TMDB contains those names. Queries are sent unchanged to TMDB; no translation or second metadata source is used.

The [Stremio manifest protocol](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md), [metadata protocol](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/meta.md), and [TMDB Discover TV reference](https://developer.themoviedb.org/reference/discover-tv) describe the upstream contracts.

## API

```text
GET /configure/
GET /api/config
PUT /api/config             application/json; whole validated configuration
GET /api/lookups            genres, countries, languages
GET /api/status             saved credential presence only; no secrets
PUT /api/credentials        required apiKey, optional token; returns status only
GET /manifest.json
GET /catalog/series/<catalog-id>.json
GET /catalog/series/<catalog-id>/genre=<encoded-name>&skip=20.json
GET /catalog/series/cnative_search/search=<encoded-query>.json
GET /meta/series/cnative:tt1234567.json
GET /meta/series/cnative:tmdb:123.json
GET /meta/series/tt1234567.json
GET /meta/series/tmdb:123.json
```

Stremio extras are URL-encoded path components, not ordinary URL query parameters. Search terms containing `&` must encode it as `%26`.

## Architecture

```text
configure/src/       React + TypeScript + Vite configuration UI
shared/config.ts     Canonical Zod schemas, types, defaults, sort choices
addon/src/
  app.ts             Express config API, static UI, Stremio HTTP transport
  stremio.ts         Typed SDK runtime boundary
  manifest.ts        Dynamic enabled catalogs, order, extras and Home visibility
  handlers/          Thin Stremio resource handlers
  config/            Validated, atomic JSON ConfigStore
  catalogs/          Discover query builder and catalog/search services
  providers/tmdb/    Validated TMDB responses, native fetch, timeout, concurrency limit
  metadata/          Chinese metadata mapping, season/episode mapping, coverage metrics
  ids/               Bidirectional TMDB/IMDb mapping
  cache/             Bounded in-memory LRU/TTL cache and in-flight request deduplication
  utils/             Pagination, language detection, artwork URL construction
addon/scripts/       Live metadata coverage CLI
tests/               Unit and HTTP integration tests with explicit TMDB fixtures
```

TMDB metadata requests use `language=zh-CN`. Genre lists additionally use `en-US` to supply existing English labels alongside Chinese labels in the editor, Stremio filters, and metadata. At most six requests run concurrently with a 12-second timeout each. Upstream failures are surfaced, not cached as success or converted to missing IMDb mappings.

Cache lifetimes: catalog/search 5 minutes; series/seasons 6 hours; lookup lists 24 hours; ID mappings 30 days. Cache sizes are bounded, process-local, and cleared on restart. Configuration changes affect request keys immediately. HTTP responses use `no-store` to avoid an intermediary retaining old configuration behavior.

The SDK validates the manifest and dispatches handlers; Express handles HTTP. A narrow typed boundary describes the SDK’s actual positional `get` method and metadata shapes because its DefinitelyTyped declarations are outdated. The lockfile includes patched SDK transitive dependencies through scoped overrides.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Tests cover configuration validation/persistence, every sort and filter, inclusive genre matching, bilingual labels, native genre selection, pagination, ID mapping, Chinese metadata/episode fallback policy, search, caching, HTTP endpoints and manifest controls. Tests use fixtures, not live TMDB, and need no credentials. The sample title in tests is fixture data and does not prove current TMDB coverage.

Manual installation check with a configured server:

1. Create `大陆热门剧集`, country China, language Chinese, popularity descending, minimum rating 6, minimum votes 20. Save.
2. Fetch its catalog endpoint and confirm the response contains native names and Chinese descriptions where TMDB has them.
3. Install the manifest in Stremio. Open the catalog, select a Chinese genre and scroll to another page.
4. Open a series from cNative, verify its `cnative:` metadata ID, separate `imdb_id` where available, standard episode IDs and Chinese episode metadata. In the updated Harbor client, check the IMDb badge without an English metadata replacement.
5. Search by original and international title. Use the **cNative · 华语搜索** row; other addons can show their own results. Results depend on TMDB’s stored names and alternatives.
6. Reorder/disable/hide catalogs, save and reinstall. Verify Home versus Discover visibility.

## Measure metadata coverage

Run against the first enabled catalog (20 series by default):

```sh
npm run metadata:coverage
npm run metadata:coverage -- --limit=10 --output=./data/coverage.json
npm run metadata:coverage -- --ids=tt35316225,tmdb:123456 --output=./data/coverage.json
```

Use real IDs from your catalog; IDs above illustrate the accepted formats. `--limit` accepts 1–100. The JSON report includes series-level rows, failures, denominators and percentages for Chinese titles, Chinese synopses, Chinese episode titles/overviews and IMDb mappings. A Han-character check approximates Chinese text availability; it does not certify language quality. Generated episode fallback names do not count as TMDB coverage. Failed series are listed separately, excluded from denominators, and cause a nonzero exit status. Nothing is translated and no second provider is queried.

## Scope

TV series metadata only. No movies, streams, torrents, debrid, subtitles, scraping, translation APIs, LLM translation, Redis, public accounts, TMDB account linking, Bangumi, Douban, or second metadata provider.

This product uses the TMDB API but is not endorsed or certified by TMDB.
