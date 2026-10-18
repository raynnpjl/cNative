import type { AddonConfig } from '../../../shared/config';
import type { ReactNode } from 'react';
import { customPosterUrlSchema, MAX_POSTER_URL_LENGTH } from '../../../shared/poster-source';
import { Toggle } from '../components/Toggle';

export function General({ config, onChange, children }: { config: AddonConfig; onChange: (config: AddonConfig) => void; children: ReactNode }) {
  const posterValidation = customPosterUrlSchema.safeParse(config.customPosterUrl ?? '');
  return <section className="general-panel panel">
    <div className="section-heading"><div><h2>Setup</h2><p>Choose how your Chinese drama library feels.</p></div><span className="section-mark" aria-hidden="true">原</span></div>
    {children}
    <div className="poster-source">
      <h3>Custom poster source</h3>
      <p>Use styled posters or rating badges from your poster provider. Catalog title, synopsis and episode languages stay as selected.</p>
      <label htmlFor="custom-poster-url">Custom poster URL (optional)</label>
      <input id="custom-poster-url" type="text" autoComplete="off" spellCheck={false} maxLength={MAX_POSTER_URL_LENGTH} value={config.customPosterUrl ?? ''} onChange={event => onChange({ ...config, customPosterUrl: event.target.value || undefined })} placeholder="https://posters.example.com/{imdb_id}.jpg" aria-invalid={!posterValidation.success} aria-describedby={`poster-source-help${posterValidation.success ? '' : ' poster-source-error'}`} />
      <p id="poster-source-help">Paste your provider’s URL template, including its API key if required. It is encrypted in your personal installation link. Leave blank to use TMDB posters. Shows missing a required ID keep their TMDB poster; artwork language depends on your provider.</p>
      <details><summary>Supported placeholders</summary><p><code>{'{imdb_id}'}</code> IMDb ID; <code>{'{tmdb_id}'}</code> TMDB number; <code>{'{type}'}</code> series; <code>{'{shape}'}</code> poster. <code>{'{id}'}</code> uses IMDb or tmdb:number; <code>{'{id_type}'}</code> uses imdb or tmdb; <code>{'{typed_id}'}</code> uses IMDb or series-number. Add ? for optional values, e.g. <code>{'{imdb_id?}'}</code>, or | for the first available value, e.g. <code>{'{imdb_id|tmdb_id}'}</code>.</p></details>
      {!posterValidation.success && <div id="poster-source-error" className="notice error" role="alert">{posterValidation.error.issues[0]?.message}</div>}
    </div>
    <div className="setting"><div><h3>Adult content</h3><p>Include adult titles in catalogs and search.</p></div><Toggle checked={config.includeAdult} onChange={includeAdult => onChange({ ...config, includeAdult })} label={config.includeAdult ? 'On' : 'Off'} /></div>
    <div className="principle"><span aria-hidden="true">文</span><p><strong>Native metadata. Never translated by us.</strong><br />Metadata comes from TMDB. When a description is missing, we leave it empty.</p></div>
  </section>;
}
