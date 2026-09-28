import { useEffect, useState } from 'react';
import { createDefaultConfig, type AddonConfig, type Lookups } from '../../shared/config';
import type { TmdbCredentials as Credentials } from '../../shared/credentials';
import { decodeInstallation, encodeInstallation, installationFromPath } from '../../shared/installation';
import { getLookups, saveInstallation } from './api';
import { TmdbCredentials, type CredentialDraft } from './components/TmdbCredentials';
import { General } from './pages/General';
import { Catalogs } from './pages/Catalogs';

export default function App() {
  const [initial] = useState(() => {
    try { return { installation: installationFromPath(window.location.pathname), error: '' }; }
    catch (error) { return { installation: undefined, error: error instanceof Error ? error.message : 'Invalid installation link.' }; }
  });
  const [config, setConfig] = useState<AddonConfig | undefined>(initial.error ? undefined : initial.installation?.config ?? createDefaultConfig());
  const [saved, setSaved] = useState(JSON.stringify(config));
  const [tab, setTab] = useState<'catalogs' | 'general'>(initial.installation ? 'catalogs' : 'general');
  const [lookups, setLookups] = useState<Lookups>({ genres: [], countries: [], languages: [] });
  const [error, setError] = useState(initial.error);
  const [lookupError, setLookupError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState<Credentials | undefined>(initial.installation?.credentials);
  const [validated, setValidated] = useState(false);
  const [encoded, setEncoded] = useState(initial.installation ? encodeInstallation(initial.installation) : '');
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft>({ apiKey: credentials?.apiKey ?? '', token: credentials?.token ?? '' });
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const dirty = Boolean(config && JSON.stringify(config) !== saved);
  const credentialsDirty = credentialDraft.apiKey !== (credentials?.apiKey ?? '') || credentialDraft.token !== (credentials?.token ?? '');
  const status = { tmdbConfigured: validated };
  const canInstall = Boolean(config && encoded && validated && !dirty && !credentialsDirty && !saving && !credentialSaving);

  async function loadLookups() {
    if (!credentials) return;
    try { setLookups(await getLookups(credentials)); setLookupError(''); setValidated(true); }
    catch (error) { setLookupError(error instanceof Error ? error.message : 'Could not load TMDB choices.'); }
  }
  useEffect(() => {
    if (!credentials) return;
    let active = true;
    getLookups(credentials).then(value => {
      if (active) { setLookups(value); setLookupError(''); setValidated(true); }
    }).catch(error => { if (active) setLookupError(error instanceof Error ? error.message : 'Could not load TMDB choices.'); });
    return () => { active = false; };
  }, [credentials]);
  useEffect(() => {
    if (!dirty && !credentialsDirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, credentialsDirty]);
  async function savePersonalLink(nextCredentials: Credentials) {
    if (!config) return;
    const result = await saveInstallation({ version: 1, config, credentials: nextCredentials });
    const installation = decodeInstallation(result.encodedConfig);
    window.history.replaceState(null, '', `/${result.encodedConfig}/configure`);
    setConfig(installation.config); setSaved(JSON.stringify(installation.config));
    setCredentials(installation.credentials); setValidated(true); setEncoded(result.encodedConfig);
    setCredentialDraft({ apiKey: installation.credentials.apiKey, token: installation.credentials.token ?? '' });
  }
  async function saveTmdb() {
    if (!credentialDraft.apiKey.trim() || credentialSaving) return;
    setCredentialSaving(true); setCredentialError(''); setMessage('');
    try {
      await savePersonalLink({ apiKey: credentialDraft.apiKey.trim(), ...(credentialDraft.token.trim() ? { token: credentialDraft.token.trim() } : {}) });
      setMessage('TMDB credentials saved to your personal link. Install the addon to apply them in Stremio.');
    } catch (error) { setCredentialError(error instanceof Error ? error.message : 'Could not validate TMDB credentials.'); }
    finally { setCredentialSaving(false); }
  }
  async function save() {
    if (!config || !credentials) { setError('Save your TMDB API key in General Settings first.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await savePersonalLink(credentials);
      setMessage('Configuration saved to your personal link. Reinstall the addon in Stremio to apply changes.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setSaving(false); }
  }
  const addonOrigin = new URL(window.location.origin);
  if (import.meta.env.DEV) addonOrigin.port = '7000';
  // Stremio supports plain HTTP addons on the loopback IP.
  if (addonOrigin.protocol === 'http:' && addonOrigin.hostname === 'localhost') addonOrigin.hostname = '127.0.0.1';
  const manifestUrl = `${addonOrigin.origin}/${encoded}/manifest.json`;
  const installUrl = `stremio://${addonOrigin.host}/${encoded}/manifest.json`;

  return <div className="app-shell"><aside className="sidebar"><a className="brand" href={encoded ? `/${encoded}/configure` : '/configure'}><span className="brand-icon">原</span><span>cNative</span></a><div className="sidebar-label">YOUR LIBRARY</div><nav aria-label="Configuration sections"><button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><span aria-hidden="true">☷</span>General Settings</button><button className={tab === 'catalogs' ? 'active' : ''} onClick={() => setTab('catalogs')}><span aria-hidden="true">▤</span>Catalogs<span className="nav-count">{config?.catalogs.length ?? '—'}</span></button></nav><div className="sidebar-bottom"><span className="status-dot" />TV series only<div>Made for the stories<br />closer to home.</div><small>cNative v1.1.0</small></div></aside>
    <main><header className="topbar"><span></span><a className="button secondary install" role="link" tabIndex={0} aria-disabled={!canInstall} href={canInstall ? installUrl : undefined} onClick={event => { if (!canInstall) { event.preventDefault(); setMessage(status?.tmdbConfigured ? 'Save your changes before installing.' : 'Save your TMDB API key in General Settings before installing.'); } }}>Install in Stremio <span aria-hidden="true">↗</span></a></header>
      <div className="main-content"><section className="hero"><div><span className="eyebrow"><span className="status-dot" /> Native Titles, Native Synopsis</span><h1>Exclusively Made<br /><span>For C-Drama.</span></h1></div><div className="hero-art" aria-hidden="true"><div className="orbit" /><span className="hanzi">剧</span></div></section>
      {status && !status.tmdbConfigured && <div className="notice warning" role="status"><div><strong>TMDB API key required</strong><p>Save your API key in General Settings to enable installation.</p></div>{tab !== 'general' && <button onClick={() => setTab('general')}>Set up TMDB</button>}</div>}
      {lookupError && <div className="notice warning" role="status"><div><strong>TMDB connection needs attention</strong><p>{lookupError}</p></div><button onClick={() => void loadLookups()}>Retry</button></div>}
      {error && <div className="notice error" role="alert">{error}{!config && <button onClick={() => window.location.reload()}>Reload</button>}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {!config ? <div className="panel loading">{error ? 'Configuration unavailable.' : 'Loading your library…'}</div> : <fieldset className="workspace" disabled={saving || credentialSaving}>{tab === 'general' ? <General config={config} onChange={setConfig}><TmdbCredentials value={credentialDraft} onChange={setCredentialDraft} status={status} saving={credentialSaving} error={credentialError} onSave={() => void saveTmdb()} /></General> : <Catalogs catalogs={config.catalogs} lookups={lookups} onChange={catalogs => setConfig({ ...config, catalogs })} />}</fieldset>}
      <footer className="page-footer"><p>Metadata provided by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.<br /><small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small></p><button className="text-button" disabled={!canInstall} onClick={() => { navigator.clipboard.writeText(manifestUrl).then(() => setMessage('Manifest URL copied.')).catch(() => setMessage(manifestUrl)); }}>Copy manifest URL ↗</button></footer>
      </div><div className="save-bar"><span><span className={`status-dot ${dirty ? 'unsaved' : ''}`} />{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="button primary" disabled={!dirty || saving || credentialSaving || credentialsDirty || !credentials} onClick={() => void save()}>{saving ? 'Saving…' : 'Save configuration'}<span aria-hidden="true">→</span></button></div>
    </main></div>;
}
