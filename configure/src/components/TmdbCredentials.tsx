import type { TmdbStatus } from '../../../shared/credentials';

export interface CredentialDraft { apiKey: string; token: string }

export function TmdbCredentials({ value, onChange, status, saving, error, onSave }: {
  value: CredentialDraft;
  onChange: (value: CredentialDraft) => void;
  status?: TmdbStatus;
  saving: boolean;
  error: string;
  onSave: () => void;
}) {
  return <form className="tmdb-credentials" onSubmit={event => { event.preventDefault(); onSave(); }}>
    <div className="credentials-heading"><div><h3>TMDB access</h3><p>Save your API key to enable addon installation. <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">Get your TMDB API key ↗</a></p></div><span className="badge">{status?.tmdbConfigured ? 'API key saved' : 'API key required'}</span></div>
    <fieldset disabled={saving}>
      <div className="field-grid">
        <label>TMDB API key (required)<input type="password" autoComplete="off" spellCheck={false} required maxLength={512} value={value.apiKey} onChange={event => onChange({ ...value, apiKey: event.target.value })} placeholder={status?.tmdbConfigured ? 'Enter API key to replace saved credentials' : 'Enter your TMDB API key'} /></label>
        <label>Read access token (optional)<input type="password" autoComplete="off" spellCheck={false} maxLength={8192} value={value.token} onChange={event => onChange({ ...value, token: event.target.value })} placeholder="API Read Access Token" /></label>
      </div>
      <p className="credentials-help">{status?.tokenConfigured ? 'A read access token is saved. Leave this field blank when saving to use only the API key.' : 'The API key is enough. Add a read access token only if you want to use it.'} Saved credentials stay private and are not displayed here.</p>
      <button className="button secondary" type="submit" disabled={!value.apiKey.trim() || saving}>{saving ? 'Checking and saving…' : 'Save API key'}</button>
    </fieldset>
    {error && <div className="notice error" role="alert">{error}</div>}
  </form>;
}
