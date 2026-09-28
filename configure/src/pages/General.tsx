import type { AddonConfig } from '../../../shared/config';
import type { ReactNode } from 'react';
import { Toggle } from '../components/Toggle';

export function General({ config, onChange, children }: { config: AddonConfig; onChange: (config: AddonConfig) => void; children: ReactNode }) {
  return <section className="general-panel panel">
    <div className="section-heading"><div><span className="eyebrow">THE ORIGINAL MATTERS</span><h2>General settings</h2><p>Choose how your Chinese drama library feels.</p></div><span className="section-mark" aria-hidden="true">原</span></div>
    {children}
    <div className="setting"><div><h3>Metadata language</h3><p>Existing Chinese descriptions, genres, and episode details.</p></div><label className="compact"><span className="sr-only">Metadata language</span><select disabled value="zh-CN"><option value="zh-CN">简体中文 · zh-CN</option></select><small>Fixed for version 1</small></label></div>
    <div className="setting"><div><h3>Chinese title mode</h3><p>Keep the name a story was given.</p></div><label className="compact"><span className="sr-only">Chinese title mode</span><select value={config.titleMode} onChange={event => onChange({ ...config, titleMode: event.target.value === 'native' ? 'native' : 'localized' })}><option value="native">Native / Original Title</option><option value="localized">TMDB Chinese-localized Title</option></select></label></div>
    <div className="setting"><div><h3>Search scope</h3><p>Chinese language or Chinese origin. Search queries stay as typed.</p></div><label className="compact"><span className="sr-only">Search scope</span><select value={config.searchScope} onChange={event => onChange({ ...config, searchScope: event.target.value === 'chinese' ? 'chinese' : 'all' })}><option value="chinese">Chinese content</option><option value="all">All TV series</option></select></label></div>
    <div className="setting"><div><h3>Adult content</h3><p>Include adult titles in catalogs and search.</p></div><Toggle checked={config.includeAdult} onChange={includeAdult => onChange({ ...config, includeAdult })} label={config.includeAdult ? 'On' : 'Off'} /></div>
    <div className="principle"><span aria-hidden="true">文</span><p><strong>Native metadata. Never translated by us.</strong><br />Everything comes from TMDB. When a description is missing, we leave it empty.</p></div>
  </section>;
}
