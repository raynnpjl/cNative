import type { AddonConfig } from '../../../shared/config';
import type { ReactNode } from 'react';
import { Toggle } from '../components/Toggle';

export function General({ config, onChange, children }: { config: AddonConfig; onChange: (config: AddonConfig) => void; children: ReactNode }) {
  return <section className="general-panel panel">
    <div className="section-heading"><div><span className="eyebrow">THE ORIGINAL MATTERS</span><h2>General settings</h2><p>Choose how your Chinese drama library feels.</p></div><span className="section-mark" aria-hidden="true">原</span></div>
    {children}
    <div className="setting"><div><h3>Display languages</h3><p>Choose title, synopsis, and episode-name languages in each catalog’s settings.</p></div></div>
    <div className="setting"><div><h3>Search scope</h3><p>Chinese language or Chinese origin. Search queries stay as typed. The dedicated cNative search catalog uses Simplified Chinese.</p></div><label className="compact"><span className="sr-only">Search scope</span><select value={config.searchScope} onChange={event => onChange({ ...config, searchScope: event.target.value === 'chinese' ? 'chinese' : 'all' })}><option value="chinese">Chinese content</option><option value="all">All TV series</option></select></label></div>
    <div className="setting"><div><h3>Adult content</h3><p>Include adult titles in catalogs and search.</p></div><Toggle checked={config.includeAdult} onChange={includeAdult => onChange({ ...config, includeAdult })} label={config.includeAdult ? 'On' : 'Off'} /></div>
    <div className="principle"><span aria-hidden="true">文</span><p><strong>Native metadata. Never translated by us.</strong><br />Everything comes from TMDB. When a description is missing, we leave it empty.</p></div>
  </section>;
}
