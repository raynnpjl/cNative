import type { CredentialStatus } from '../../../shared/installation';

export interface CredentialDraft { apiKey: string; token: string; removeToken: boolean }

export function TmdbCredentials({ value, onChange, status, saving, error, onSave }: {
  value: CredentialDraft;
  onChange: (value: CredentialDraft) => void;
  status: CredentialStatus;
  saving: boolean;
  error: string;
  onSave: () => void;
}) {
  return <form className="tmdb-credentials" onSubmit={event => { event.preventDefault(); onSave(); }}>
    <div className="credentials-heading"><div><h3>TMDB access</h3><p>Save your API key to enable addon installation. <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">Get your TMDB API key ↗</a></p></div><span className="badge">{status.hasApiKey ? 'API key saved' : 'API key required'}</span></div>
    <fieldset disabled={saving}>
      <div className="field-grid">
        <label>TMDB API key (required)<input type="password" autoComplete="off" spellCheck={false} required={!status.hasApiKey} maxLength={512} value={value.apiKey} onChange={event => onChange({ ...value, apiKey: event.target.value })} placeholder={status.hasApiKey ? 'Saved — enter a replacement to change it' : 'Enter your TMDB API key'} /></label>
        <label>Read access token (optional)<input type="password" autoComplete="off" spellCheck={false} maxLength={8192} value={value.token} onChange={event => onChange({ ...value, token: event.target.value, removeToken: false })} placeholder={status.hasReadAccessToken ? 'Saved — enter a replacement to change it' : 'API Read Access Token'} /></label>
      </div>
      {status.hasReadAccessToken && <label className="credentials-help"><input type="checkbox" checked={value.removeToken} onChange={event => onChange({ ...value, removeToken: event.target.checked, token: '' })} />Remove saved read access token</label>}
      <p className="credentials-help">{status.hasReadAccessToken ? 'Read access token saved. ' : ''}The API key is enough; the read access token is optional. Saved credentials stay hidden. Leave fields blank to keep them. Your encrypted install link grants addon access. Keep it private.</p>
      <button className="button secondary" type="submit" disabled={(!status.hasApiKey && !value.apiKey.trim()) || !(value.apiKey || value.token || value.removeToken) || saving}>{saving ? 'Checking and saving…' : 'Save API key'}</button>
    </fieldset>
    {error && <div className="notice error" role="alert">{error}</div>}
  </form>;
}
