import type { AddonConfig } from '../../../shared/config';
import type { ReactNode } from 'react';
import { Toggle } from '../components/Toggle';

export function General({ config, onChange, children }: { config: AddonConfig; onChange: (config: AddonConfig) => void; children: ReactNode }) {
  return <section className="general-panel panel">
    <div className="section-heading"><div><h2>Setup</h2><p>Choose how your Chinese drama library feels.</p></div><span className="section-mark" aria-hidden="true">原</span></div>
    {children}
    <div className="setting"><div><h3>Adult content</h3><p>Include adult titles in catalogs and search.</p></div><Toggle checked={config.includeAdult} onChange={includeAdult => onChange({ ...config, includeAdult })} label={config.includeAdult ? 'On' : 'Off'} /></div>
    <div className="principle"><span aria-hidden="true">文</span><p><strong>Native metadata. Never translated by us.</strong><br />Everything comes from TMDB. When a description is missing, we leave it empty.</p></div>
  </section>;
}
