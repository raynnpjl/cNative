import { useEffect, useState } from 'react';
import type { AddonConfig, Lookups } from '../../shared/config';
import type { TmdbStatus } from '../../shared/credentials';
import { getConfig, getLookups, getStatus, saveConfig, saveCredentials } from './api';
import { TmdbCredentials, type CredentialDraft } from './components/TmdbCredentials';
import { General } from './pages/General';
import { Catalogs } from './pages/Catalogs';

export default function App() {
  const [config, setConfig] = useState<AddonConfig>();
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState<'catalogs' | 'general'>('catalogs');
  const [lookups, setLookups] = useState<Lookups>({ genres: [], countries: [], languages: [] });
  const [error, setError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<TmdbStatus>();
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft>({ apiKey: '', token: '' });
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const dirty = Boolean(config && JSON.stringify(config) !== saved);
  const credentialsDirty = Boolean(credentialDraft.apiKey || credentialDraft.token);
  const canInstall = Boolean(config && status?.tmdbConfigured && !dirty && !credentialsDirty && !saving && !credentialSaving);

  async function loadLookups() {
    try { setLookups(await getLookups()); setLookupError(''); }
    catch (error) { setLookupError(error instanceof Error ? error.message : 'Could not load TMDB choices.'); }
  }
  useEffect(() => {
    let active = true;
    getConfig().then(value => { if (active) { setConfig(value); setSaved(JSON.stringify(value)); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load configuration.'); });
    getStatus().then(value => {
      if (!active) return;
      setStatus(value);
      if (!value.tmdbConfigured) { setTab('general'); return; }
      getLookups().then(value => { if (active) setLookups(value); }).catch(error => { if (active) setLookupError(error instanceof Error ? error.message : 'Could not load TMDB choices.'); });
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load TMDB status.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!dirty && !credentialsDirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, credentialsDirty]);
  async function saveTmdb() {
    if (!credentialDraft.apiKey.trim() || credentialSaving) return;
    setCredentialSaving(true); setCredentialError(''); setMessage('');
    try {
      const next = await saveCredentials({ apiKey: credentialDraft.apiKey.trim(), ...(credentialDraft.token.trim() ? { token: credentialDraft.token.trim() } : {}) });
      setStatus(next); setCredentialDraft({ apiKey: '', token: '' });
      setMessage('TMDB credentials saved.');
      await loadLookups();
    } catch (error) { setCredentialError(error instanceof Error ? error.message : 'Could not save TMDB credentials.'); }
    finally { setCredentialSaving(false); }
  }
  async function save() {
    if (!config) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await saveConfig(config);
      setSaved(JSON.stringify(result));
      setMessage('Configuration saved. Reinstall the addon in Stremio to refresh catalog layout.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setSaving(false); }
  }
  const addonHost = import.meta.env.DEV ? `${window.location.hostname}:7000` : window.location.host;
  const manifestUrl = `${window.location.protocol}//${addonHost}/manifest.json`;
  const installUrl = `stremio://${addonHost}/manifest.json`;

  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="/configure/"><span className="brand-icon">原</span><span>cNative</span></a><div className="sidebar-label">YOUR LIBRARY</div><nav aria-label="Configuration sections"><button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><span aria-hidden="true">☷</span>General Settings</button><button className={tab === 'catalogs' ? 'active' : ''} onClick={() => setTab('catalogs')}><span aria-hidden="true">▤</span>Catalogs<span className="nav-count">{config?.catalogs.length ?? '—'}</span></button></nav><div className="sidebar-bottom"><span className="status-dot" />TV series only<div>Made for the stories<br />closer to home.</div><small>cNative v1.0.4</small></div></aside>
    <main><header className="topbar"><span></span><a className="button secondary install" role="link" tabIndex={0} aria-disabled={!canInstall} href={canInstall ? installUrl : undefined} onClick={event => { if (!canInstall) { event.preventDefault(); setMessage(status?.tmdbConfigured ? 'Save your changes before installing.' : 'Save your TMDB API key in General Settings before installing.'); } }}>Install in Stremio <span aria-hidden="true">↗</span></a></header>
      <div className="main-content"><section className="hero"><div><span className="eyebrow"><span className="status-dot" /> Native Titles, Native Synopsis</span><h1>Exclusively Made<br /><span>For C-Drama.</span></h1></div><div className="hero-art" aria-hidden="true"><div className="orbit" /><span className="hanzi">剧</span></div></section>
      {status && !status.tmdbConfigured && <div className="notice warning" role="status"><div><strong>TMDB API key required</strong><p>Save your API key in General Settings to enable installation.</p></div>{tab !== 'general' && <button onClick={() => setTab('general')}>Set up TMDB</button>}</div>}
      {lookupError && <div className="notice warning" role="status"><div><strong>TMDB connection needs attention</strong><p>{lookupError}</p></div><button onClick={() => void loadLookups()}>Retry</button></div>}
      {error && <div className="notice error" role="alert">{error}{!config && <button onClick={() => window.location.reload()}>Reload</button>}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {!config ? <div className="panel loading">{error ? 'Configuration unavailable.' : 'Loading your library…'}</div> : <fieldset className="workspace" disabled={saving}>{tab === 'general' ? <General config={config} onChange={setConfig}><TmdbCredentials value={credentialDraft} onChange={setCredentialDraft} status={status} saving={credentialSaving} error={credentialError} onSave={() => void saveTmdb()} /></General> : <Catalogs catalogs={config.catalogs} lookups={lookups} onChange={catalogs => setConfig({ ...config, catalogs })} />}</fieldset>}
      <footer className="page-footer"><p>Metadata provided by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.<br /><small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small></p><button className="text-button" disabled={!canInstall} onClick={() => { navigator.clipboard.writeText(manifestUrl).then(() => setMessage('Manifest URL copied.')).catch(() => setMessage(manifestUrl)); }}>Copy manifest URL ↗</button></footer>
      </div><div className="save-bar"><span><span className={`status-dot ${dirty ? 'unsaved' : ''}`} />{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="button primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save configuration'}<span aria-hidden="true">→</span></button></div>
    </main></div>;
}
