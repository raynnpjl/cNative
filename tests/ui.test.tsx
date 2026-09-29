// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../configure/src/App';
import { createDefaultConfig, type AddonConfig, type Lookups } from '../shared/config';
import { saveInstallationSchema, type CredentialChanges } from '../shared/installation';
import { decodeInstallation, encodeInstallation } from './installation-fixture';
import { configurationView } from '../addon/src/config/installation';

const lookups: Lookups = {
  genres: [{ id: 18, name: '剧情 · Drama' }, { id: 35, name: '喜剧 · Comedy' }],
  countries: [{ iso_3166_1: 'CN', english_name: 'China', native_name: '中国' }],
  languages: [{ iso_639_1: 'zh', english_name: 'Chinese', name: '中文' }],
};
let persisted: AddonConfig;
let failSave: boolean;
let credentialSaves: CredentialChanges[];
let failCredentials: boolean;
beforeEach(() => {
  persisted = createDefaultConfig(); failSave = false;
  credentialSaves = []; failCredentials = false;
  window.history.replaceState(null, '', `/${encodeInstallation({ version: 1, config: persisted, credentials: { apiKey: 'test-key', token: 'test-token' } })}/configure`);
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === '/api/lookups') return Response.json(lookups);
    if (String(input) === '/api/configuration') {
      const { encodedConfig } = JSON.parse(String(init?.body));
      return Response.json(configurationView(decodeInstallation(encodedConfig)));
    }
    if (String(input) === '/api/configure') {
      if (failCredentials) return Response.json({ error: 'TMDB rejected the API key. Check it and try again.' }, { status: 400 });
      if (failSave) return Response.json({ error: 'TMDB temporarily unavailable' }, { status: 502 });
      const request = saveInstallationSchema.parse(JSON.parse(String(init?.body)));
      const previous = request.encodedConfig ? decodeInstallation(request.encodedConfig).credentials : undefined;
      if (request.credentialChanges) credentialSaves.push(request.credentialChanges);
      const token = request.credentialChanges?.token === undefined ? previous?.token : request.credentialChanges.token;
      const installation = { version: 1 as const, config: request.config, credentials: { apiKey: request.credentialChanges?.apiKey ?? previous!.apiKey, ...(token ? { token } : {}) } };
      persisted = installation.config;
      return Response.json({ encodedConfig: encodeInstallation(installation), ...configurationView(installation) });
    }
    throw new Error(`Unexpected API endpoint: ${input}`);
  }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([true, false])('uses the loopback IP in install and copied links (development: %s)', async development => {
  vi.stubEnv('DEV', development);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  expect(window.location.hostname).toBe('localhost');
  render(<App />);
  const manifestPath = window.location.pathname.replace('/configure', '/manifest.json');
  const port = development ? '7000' : window.location.port;
  const host = `127.0.0.1${port ? `:${port}` : ''}`;
  await waitFor(() => expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBe(`stremio://${host}${manifestPath}`));
  fireEvent.click(screen.getByRole('button', { name: /Copy manifest URL/ }));
  expect(writeText).toHaveBeenCalledWith(`http://${host}${manifestPath}`);
});

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

it.each(Array.from({ length: 8 }, (_, index) => index))('saves and restores display-language combination %i independently of original language', async combination => {
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const labels = ['Title', 'Synopsis', 'Episode'];
  const name = `Language combination ${combination}`;
  fireEvent.change(screen.getByLabelText('Catalog name'), { target: { value: name } });
  const values = labels.map((_, index) => combination & (1 << index) ? 'en-US' : 'zh-CN');
  labels.forEach((label, index) => {
    expect((screen.getByLabelText(label) as HTMLSelectElement).value).toBe('zh-CN');
    fireEvent.change(screen.getByLabelText(label), { target: { value: values[index] } });
  });
  expect((screen.getByLabelText('Original language') as HTMLSelectElement).value).toBe('zh');
  fireEvent.click(screen.getByRole('button', { name: 'Apply catalog' }));
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  const encoded = window.location.pathname.split('/')[1]!;
  expect(decodeInstallation(encoded).config.catalogs[0]).toMatchObject({ titleLanguage: values[0], synopsisLanguage: values[1], episodeNameLanguage: values[2], originalLanguage: 'zh' });
  cleanup(); render(<App />);
  await screen.findByRole('heading', { name });
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  labels.forEach((label, index) => expect((screen.getByLabelText(label) as HTMLSelectElement).value).toBe(values[index]));
  expect(credentialSaves).toEqual([]);
  for (const [url, init] of vi.mocked(fetch).mock.calls) {
    expect(String(url)).not.toMatch(/test-key|test-token/);
    expect(String(init?.body)).not.toMatch(/test-key|test-token/);
  }
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
  expect(screen.queryByLabelText('Chinese title mode')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: 'Off' }));
  failSave = true;
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText('TMDB temporarily unavailable');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect(persisted.includeAdult).toBe(false);
  failSave = false;
  await waitFor(() => expect((screen.getByRole('button', { name: /Save configuration/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(persisted).toMatchObject({ searchScope: 'all', includeAdult: true });
});

it('blocks installation and copying until an API key is saved, with no token required', async () => {
  window.history.replaceState(null, '', '/configure');
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
  await screen.findByText(/TMDB credentials saved to your personal link/);
  await waitFor(() => expect(install.getAttribute('href')).toContain('stremio://'));
  expect(credentialSaves).toEqual([{ apiKey: 'user-api-key' }]);
  expect((apiKey as HTMLInputElement).value).toBe('');
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input) === '/api/lookups')).toBe(true);
  expect(persisted).not.toHaveProperty('apiKey');
});

it('does not accept token-only setup and preserves input on a rejected save', async () => {
  window.history.replaceState(null, '', '/configure');
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
  await screen.findByText(/TMDB credentials saved to your personal link/);
  expect(credentialSaves).toEqual([{ apiKey: 'valid-key', token: 'read-token' }]);
  expect((token as HTMLInputElement).value).toBe('');
});

it.each([
  [405, ''],
  [502, '<html>Upstream unavailable</html>'],
])('explains an unreadable save response (HTTP %s) and keeps installation disabled', async (status, body) => {
  window.history.replaceState(null, '', '/configure');
  vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status }));
  render(<App />);
  const apiKey = await screen.findByLabelText('TMDB API key (required)');
  const token = screen.getByLabelText('Read access token (optional)');
  fireEvent.change(apiKey, { target: { value: 'user-api-key' } });
  fireEvent.change(token, { target: { value: 'user-token' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  expect((await screen.findByRole('alert')).textContent).toBe(`The addon server returned an invalid response (HTTP ${status}).`);
  expect((apiKey as HTMLInputElement).value).toBe('user-api-key');
  expect((token as HTMLInputElement).value).toBe('user-token');
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  expect((screen.getByRole('button', { name: /Copy manifest URL/ }) as HTMLButtonElement).disabled).toBe(true);
});

it('restores settings with hidden saved credentials and gates unsaved credential edits', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  const apiKey = screen.getByLabelText('TMDB API key (required)');
  expect((apiKey as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Read access token (optional)') as HTMLInputElement).value).toBe('');
  await screen.findByText('API key saved');
  fireEvent.change(apiKey, { target: { value: 'replacement-key' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Remove saved read access token' }));
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Catalogs/ }));
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  expect((screen.getByLabelText('TMDB API key (required)') as HTMLInputElement).value).toBe('replacement-key');
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await screen.findByText(/TMDB credentials saved to your personal link/);
  expect(decodeInstallation(window.location.pathname.split('/')[1]!).credentials).toEqual({ apiKey: 'replacement-key' });
  cleanup();
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  expect((screen.getByLabelText('TMDB API key (required)') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Read access token (optional)') as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('checkbox', { name: 'Remove saved read access token' })).toBeNull();
});

it('restores edited filters after reload and copies the same personal manifest URL', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await screen.findByRole('option', { name: /China/ });
  fireEvent.change(screen.getByLabelText('Catalog name'), { target: { value: '我的剧集 & TV' } });
  fireEvent.change(screen.getByLabelText('Origin country'), { target: { value: 'CN' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply catalog' }));
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  const path = window.location.pathname;
  cleanup(); render(<App />);
  await screen.findByRole('heading', { name: '我的剧集 & TV' });
  await waitFor(() => expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toContain(path.replace('/configure', '/manifest.json')));
  fireEvent.click(screen.getByRole('button', { name: /Copy manifest URL/ }));
  expect(writeText.mock.calls[0]?.[0]).toContain(path.replace('/configure', '/manifest.json'));
  expect(decodeInstallation(path.split('/')[1]!).config.catalogs[0]?.originCountry).toBe('CN');
});

it('fails closed on a malformed configuration URL', () => {
  window.history.replaceState(null, '', '/broken/configure');
  render(<App />);
  expect(screen.getByRole('alert').textContent).toContain('Invalid installation link');
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps saved secrets out of reconfiguration requests and preserves them on settings changes', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  expect((screen.getByLabelText('TMDB API key (required)') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Read access token (optional)') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Search scope'), { target: { value: 'all' } });
  fireEvent.click(screen.getByRole('button', { name: /Save configuration/ }));
  await screen.findByText(/Configuration saved/);
  expect(credentialSaves).toEqual([]);
  expect(decodeInstallation(window.location.pathname.split('/')[1]!).credentials).toEqual({ apiKey: 'test-key', token: 'test-token' });
  for (const [url, init] of vi.mocked(fetch).mock.calls) {
    expect(String(url)).not.toMatch(/test-key|test-token|e1\./);
    expect(String(init?.body)).not.toMatch(/test-key|test-token/);
  }
});

it('can remove or replace a saved token without re-entering the required saved key', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: '华语热门剧集' });
  fireEvent.click(screen.getByRole('button', { name: /General Settings/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Remove saved read access token' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Remove saved read access token' })).toBeNull());
  expect(credentialSaves).toEqual([{ token: null }]);
  expect(decodeInstallation(window.location.pathname.split('/')[1]!).credentials).toEqual({ apiKey: 'test-key' });
  fireEvent.change(screen.getByLabelText('Read access token (optional)'), { target: { value: 'new-token' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));
  await screen.findByRole('checkbox', { name: 'Remove saved read access token' });
  expect(decodeInstallation(window.location.pathname.split('/')[1]!).credentials).toEqual({ apiKey: 'test-key', token: 'new-token' });
  expect((screen.getByLabelText('Read access token (optional)') as HTMLInputElement).value).toBe('');
});

it('keeps installation disabled while restoring settings and after a decryption failure', async () => {
  let resolveRestore!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRestore = resolve; }));
  render(<App />);
  expect(screen.getByText('Loading your library…')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
  resolveRestore(Response.json({ error: 'Invalid installation link. Open /configure to create a new one.' }, { status: 400 }));
  await screen.findByRole('alert');
  expect(screen.getByText('Configuration unavailable.')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Install in Stremio/ }).getAttribute('href')).toBeNull();
});
