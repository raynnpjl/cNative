// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../configure/src/App';
import { addonConfigSchema, createDefaultConfig, type AddonConfig, type Lookups } from '../shared/config';
import { tmdbCredentialsSchema, type TmdbCredentials, type TmdbStatus } from '../shared/credentials';

const lookups: Lookups = {
  genres: [{ id: 18, name: '剧情 · Drama' }, { id: 35, name: '喜剧 · Comedy' }],
  countries: [{ iso_3166_1: 'CN', english_name: 'China', native_name: '中国' }],
  languages: [{ iso_639_1: 'zh', english_name: 'Chinese', name: '中文' }],
};
let persisted: AddonConfig;
let failSave: boolean;
let credentialStatus: TmdbStatus;
let credentialSaves: TmdbCredentials[];
let failCredentials: boolean;
beforeEach(() => {
  persisted = createDefaultConfig(); failSave = false;
  credentialStatus = { tmdbConfigured: true, tokenConfigured: false }; credentialSaves = []; failCredentials = false;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === '/api/status') return Response.json(credentialStatus);
    if (String(input) === '/api/credentials') {
      if (failCredentials) return Response.json({ error: 'TMDB rejected the API key. Check it and try again.' }, { status: 400 });
      const credentials = tmdbCredentialsSchema.parse(JSON.parse(String(init?.body)));
      credentialSaves.push(credentials);
      credentialStatus = { tmdbConfigured: true, tokenConfigured: Boolean(credentials.token) };
      return Response.json(credentialStatus);
    }
    if (String(input) === '/api/lookups') return Response.json(lookups);
    if (init?.method === 'PUT') {
      if (failSave) return Response.json({ error: 'Disk full' }, { status: 500 });
      persisted = addonConfigSchema.parse(JSON.parse(String(init.body)));
    }
    return Response.json(persisted);
  }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows bilingual genre choices without a match-mode selector and saves genre IDs', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.queryByRole('combobox', { name: 'Match' })).toBeNull();
  expect(screen.queryByText('ALL selected genres')).toBeNull();
  const included = within(screen.getByRole('group', { name: 'Include genres' }));
  expect(included.getByRole('button', { name: '剧情 · Drama' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(included.getByRole('button', { name: '喜剧 · Comedy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply catalog' }));
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(persisted.catalogs[0]?.includeGenres).toEqual([18, 35]);
  expect(persisted.catalogs[0]).not.toHaveProperty('genreJoinMode');
});

it('edits the requested catalog, preserves its ID and persists filters', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Catalog name'), { target: { value: '大陆热门剧集' } });
  fireEvent.change(screen.getByLabelText('Origin country'), { target: { value: 'CN' } });
  fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Minimum votes'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply catalog' }));
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(persisted.catalogs[0]).toMatchObject({ id: 'catalog_default', name: '大陆热门剧集', originCountry: 'CN', originalLanguage: 'zh', voteAverageMin: 6, voteCountMin: 20, includeGenres: [18] });
});

it('duplicates, reorders, hides, disables, deletes and undoes without losing state', async () => {
  render(<App />); await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move 华语热门剧集 · 副本 up' }));
  fireEvent.click(screen.getAllByRole('switch', { name: 'Enabled' })[0]!);
  fireEvent.click(screen.getAllByRole('switch', { name: 'Show on Home' })[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Delete 华语热门剧集' }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(persisted.catalogs).toHaveLength(2);
  expect(persisted.catalogs[0]).toMatchObject({ enabled: false, showInHome: false, name: '华语热门剧集 · 副本' });
  expect(persisted.catalogs[0]?.id).not.toBe('catalog_default');
  expect(persisted.catalogs[1]?.id).toBe('catalog_default');
});

it('adds a catalog from a preset and rejects contradictory rating ranges', async () => {
  render(<App />); await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /Add Catalog/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Top Rated' }));
  fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '9' } });
  fireEvent.change(screen.getByLabelText('Maximum rating'), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply catalog' }));
  expect(screen.getByRole('alert').textContent).toContain('Maximum');
  fireEvent.change(screen.getByLabelText('Maximum rating'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply catalog' }));
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(persisted.catalogs[1]).toMatchObject({ sortBy: 'vote_average.desc', voteCountMin: 25 });
});

it('changes General Settings and retains unsaved edits after a save failure', async () => {
  render(<App />); await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  fireEvent.change(screen.getByLabelText('Search scope'), { target: { value: 'all' } });
  fireEvent.change(screen.getByLabelText('Chinese title mode'), { target: { value: 'localized' } });
  fireEvent.click(screen.getByRole('switch', { name: 'Off' }));
  failSave = true;
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText('Disk full');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect(persisted.includeAdult).toBe(false);
  failSave = false;
  await waitFor(() => expect((screen.getByRole('button', { name: /Save configuration/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(persisted).toMatchObject({ searchScope: 'all', titleMode: 'localized', includeAdult: true });
});

it('blocks installation and copying until an API key is saved, with no token required', async () => {
  credentialStatus = { tmdbConfigured: false, tokenConfigured: false };
  render(<App />);
  const apiKey = await screen.findByLabelText('TMDB API key (required)');
  const install = screen.getByRole('link', { name: /Install in Stremio/ });
  expect(install.getAttribute('href')).toBeNull();
  expect(install.getAttribute('aria-disabled')).toBe('true');
  expect((screen.getByRole('button', { name: /Copy manifest URL/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Save API key' }) as HTMLButtonElement).disabled).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input) === '/api/lookups')).toBe(false);
  fireEvent.change(apiKey, { target: { value: ' user-api-key ' } });
  expect(install.getAttribute('href')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await screen.findByText('TMDB credentials saved.');
  await waitFor(() => expect(install.getAttribute('href')).toContain('stremio://'));
  expect(credentialSaves).toEqual([{ apiKey: 'user-api-key' }]);
  expect((apiKey as HTMLInputElement).value).toBe('');
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input) === '/api/lookups')).toBe(true);
  expect(persisted).not.toHaveProperty('apiKey');
});

it('does not accept token-only setup and preserves input on a rejected save', async () => {
  credentialStatus = { tmdbConfigured: false, tokenConfigured: false };
  render(<App />);
  const token = await screen.findByLabelText('Read access token (optional)');
  fireEvent.change(token, { target: { value: 'read-token' } });
  expect((screen.getByRole('button', { name: 'Save API key' }) as HTMLButtonElement).disabled).toBe(true);
  const apiKey = screen.getByLabelText('TMDB API key (required)');
  fireEvent.change(apiKey, { target: { value: 'invalid-key' } });
  failCredentials = true;
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await screen.findByRole('alert');
  expect((apiKey as HTMLInputElement).value).toBe('invalid-key');
  expect((token as HTMLInputElement).value).toBe('read-token');
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  expect(credentialSaves).toEqual([]);
  failCredentials = false;
  fireEvent.change(apiKey, { target: { value: 'valid-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await screen.findByText('TMDB credentials saved.');
  expect(credentialSaves).toEqual([{ apiKey: 'valid-key', token: 'read-token' }]);
  expect((token as HTMLInputElement).value).toBe('');
});

it('shows saved status without exposing secrets and gates installation during unsaved credential edits', async () => {
  credentialStatus = { tmdbConfigured: true, tokenConfigured: true };
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  const apiKey = screen.getByLabelText('TMDB API key (required)');
  expect((apiKey as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Read access token (optional)') as HTMLInputElement).value).toBe('');
  expect(screen.getByText('API key saved')).toBeTruthy();
  fireEvent.change(apiKey, { target: { value: 'replacement-key' } });
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Catalogs/ }));
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  expect((screen.getByLabelText('TMDB API key (required)') as HTMLInputElement).value).toBe('replacement-key');
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await screen.findByText('TMDB credentials saved.');
  expect(credentialStatus.tokenConfigured).toBe(false);
});
