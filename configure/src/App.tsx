import { useEffect, useState } from 'react';
import { createDefaultConfig, type AddonConfig, type Lookups } from '../../shared/config';
import { installationTokenFromPath, type CredentialChanges, type CredentialStatus } from '../../shared/installation';
import { getConfiguration, getLookups, saveInstallation } from './api';
import { TmdbCredentials, type CredentialDraft } from './components/TmdbCredentials';
import { General } from './pages/General';
import { Catalogs } from './pages/Catalogs';

export default function App() {
  const [initial] = useState(() => {
    try { return { encoded: installationTokenFromPath(window.location.pathname), error: '' }; }
    catch (error) { return { encoded: undefined, error: error instanceof Error ? error.message : 'Invalid installation link.' }; }
  });
  const [config, setConfig] = useState<AddonConfig | undefined>(initial.error || initial.encoded ? undefined : createDefaultConfig());
  const [saved, setSaved] = useState(JSON.stringify(config));
  const [tab, setTab] = useState<'catalogs' | 'general'>(initial.encoded ? 'catalogs' : 'general');
  const [lookups, setLookups] = useState<Lookups>({ genres: [] });
  const [error, setError] = useState(initial.error);
  const [lookupError, setLookupError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>({ hasApiKey: false, hasReadAccessToken: false });
  const [validated, setValidated] = useState(false);
  const [encoded, setEncoded] = useState(initial.encoded ?? '');
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft>({ apiKey: '', token: '', removeToken: false });
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const dirty = Boolean(config && JSON.stringify(config) !== saved);
  const credentialsDirty = Boolean(credentialDraft.apiKey || credentialDraft.token || credentialDraft.removeToken);
  const canInstall = Boolean(config && encoded && credentialStatus.hasApiKey && validated && !dirty && !credentialsDirty && !saving && !credentialSaving);

  async function loadLookups() {
    if (!encoded) return;
    try { setLookups(await getLookups(encoded)); setLookupError(''); setValidated(true); }
    catch (error) { setValidated(false); setLookupError(error instanceof Error ? error.message : 'Could not load TMDB choices.'); }
  }
  useEffect(() => {
    if (!initial.encoded) return;
    let active = true;
    getConfiguration(initial.encoded).then(value => {
      if (active) { setConfig(value.config); setSaved(JSON.stringify(value.config)); setCredentialStatus(value.credentialStatus); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not restore configuration.'); });
    return () => { active = false; };
  }, [initial]);
  useEffect(() => {
    if (!encoded) return;
    let active = true;
    getLookups(encoded).then(value => {
      if (active) { setLookups(value); setLookupError(''); setValidated(true); }
    }).catch(error => { if (active) { setValidated(false); setLookupError(error instanceof Error ? error.message : 'Could not load TMDB choices.'); } });
    return () => { active = false; };
  }, [encoded]);
  useEffect(() => {
    if (!dirty && !credentialsDirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, credentialsDirty]);
  async function savePersonalLink(credentialChanges?: CredentialChanges) {
    if (!config) return;
    const result = await saveInstallation({ config, ...(encoded ? { encodedConfig: encoded } : {}), ...(credentialChanges ? { credentialChanges } : {}) });
    window.history.replaceState(null, '', `/${result.encodedConfig}/configure`);
    setConfig(result.config); setSaved(JSON.stringify(result.config));
    setCredentialStatus(result.credentialStatus); setValidated(true); setEncoded(result.encodedConfig);
    setCredentialDraft({ apiKey: '', token: '', removeToken: false });
  }
  async function saveTmdb() {
    if ((!credentialStatus.hasApiKey && !credentialDraft.apiKey.trim()) || !credentialsDirty || credentialSaving) return;
    setCredentialSaving(true); setCredentialError(''); setMessage('');
    try {
      await savePersonalLink({ ...(credentialDraft.apiKey.trim() ? { apiKey: credentialDraft.apiKey.trim() } : {}), ...(credentialDraft.removeToken ? { token: null } : credentialDraft.token.trim() ? { token: credentialDraft.token.trim() } : {}) });
      setMessage('TMDB credentials saved to your personal link. Install the addon to apply them in Stremio.');
    } catch (error) { setCredentialError(error instanceof Error ? error.message : 'Could not validate TMDB credentials.'); }
    finally { setCredentialSaving(false); }
  }
  async function save() {
    if (!config || !encoded || !credentialStatus.hasApiKey) { setError('Save your TMDB API key in Setup first.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await savePersonalLink();
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

  return <div className="app-shell"><aside className="sidebar"><a className="brand" href={encoded ? `/${encoded}/configure` : '/configure'}><span className="brand-icon">原</span><span>cNative</span></a><div className="sidebar-label">YOUR LIBRARY</div><nav aria-label="Configuration sections"><button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><span aria-hidden="true">☷</span>Setup</button><button className={tab === 'catalogs' ? 'active' : ''} onClick={() => setTab('catalogs')}><span aria-hidden="true">▤</span>Catalogs<span className="nav-count">{config?.catalogs.length ?? '—'}</span></button></nav><div className="sidebar-bottom"><span className="status-dot" />TV series only<small>cNative v1.2.0</small></div></aside>
    <main><header className="topbar"><span></span><a className="button secondary install" role="link" tabIndex={0} aria-disabled={!canInstall} href={canInstall ? installUrl : undefined} onClick={event => { if (!canInstall) { event.preventDefault(); setMessage(credentialStatus.hasApiKey ? 'Save your changes before installing.' : 'Save your TMDB API key in Setup before installing.'); } }}>Install in Stremio <span aria-hidden="true">↗</span></a></header>
      <div className="main-content"><section className="hero"><div><span className="eyebrow"><span className="status-dot" /> Native Titles, Native Synopsis</span><h1>Exclusively Made<br /><span>For C-Drama.</span></h1></div><div className="hero-art" aria-hidden="true"><div className="orbit" /><span className="hanzi">剧</span></div></section>
      {config && !credentialStatus.hasApiKey && <div className="notice warning" role="status"><div><strong>TMDB API key required</strong><p>Save your API key in Setup to enable installation.</p></div>{tab !== 'general' && <button onClick={() => setTab('general')}>Set up TMDB</button>}</div>}
      {lookupError && <div className="notice warning" role="status"><div><strong>TMDB connection needs attention</strong><p>{lookupError}</p></div><button onClick={() => void loadLookups()}>Retry</button></div>}
      {error && <div className="notice error" role="alert">{error}{!config && <button onClick={() => window.location.reload()}>Reload</button>}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {!config ? <div className="panel loading">{error ? 'Configuration unavailable.' : 'Loading your library…'}</div> : <fieldset className="workspace" disabled={saving || credentialSaving}>{tab === 'general' ? <General config={config} onChange={setConfig}><TmdbCredentials value={credentialDraft} onChange={setCredentialDraft} status={credentialStatus} saving={credentialSaving} error={credentialError} onSave={() => void saveTmdb()} /></General> : <Catalogs catalogs={config.catalogs} lookups={lookups} onChange={catalogs => setConfig({ ...config, catalogs })} />}</fieldset>}
      <footer className="page-footer"><p>Metadata provided by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.<br /><small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small></p><button className="text-button" disabled={!canInstall} onClick={() => { navigator.clipboard.writeText(manifestUrl).then(() => setMessage('Manifest URL copied.')).catch(() => setMessage(manifestUrl)); }}>Copy manifest URL ↗</button></footer>
      </div><div className="save-bar"><span><span className={`status-dot ${dirty ? 'unsaved' : ''}`} />{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="button primary" disabled={!dirty || saving || credentialSaving || credentialsDirty || !credentialStatus.hasApiKey} onClick={() => void save()}>{saving ? 'Saving…' : 'Save configuration'}<span aria-hidden="true">→</span></button></div>
    </main></div>;
}
