import { useEffect, useRef, useState } from 'react';
import { catalogConfigSchema, type CatalogConfig, type DisplayLanguage, type Lookups } from '../../../shared/config';
import { GenrePicker } from './GenrePicker';
import { SortPicker } from './SortPicker';
import { Toggle } from './Toggle';

const presets = [
  { name: 'Popular', sortBy: 'popularity.desc', voteCountMin: 0 },
  { name: 'Top Rated', sortBy: 'vote_average.desc', voteCountMin: 25 },
  { name: 'Latest', sortBy: 'first_air_date.desc', voteCountMin: 0 },
  { name: 'Most Voted', sortBy: 'vote_count.desc', voteCountMin: 0 },
] as const;

export function CatalogEditor({ catalog, lookups, onSave, onClose }: { catalog: CatalogConfig; lookups: Lookups; onSave: (catalog: CatalogConfig) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(catalog);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  function set<K extends keyof CatalogConfig>(key: K, value: CatalogConfig[K]) { setDraft(current => ({ ...current, [key]: value })); }
  const number = (key: 'voteAverageMin' | 'voteAverageMax' | 'voteCountMin' | 'runtimeMin' | 'runtimeMax', label: string, max?: number, step = 1) => <label>{label}<input type="number" min="0" max={max} step={step} value={draft[key] ?? ''} placeholder="No limit" onChange={event => set(key, event.target.value === '' ? undefined : Number(event.target.value))} list={key === 'voteCountMin' ? 'vote-counts' : undefined} /></label>;
  return <dialog ref={dialog} className="editor" onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="editor-title"><form onSubmit={event => {
    event.preventDefault(); const parsed = catalogConfigSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(' · ')); return; }
    onSave(parsed.data);
  }}>
    <header className="editor-header"><div><span className="eyebrow">CATALOG BUILDER</span><h2 id="editor-title">Make room for your favorites.</h2></div><button type="button" className="icon-button" aria-label="Close catalog editor" onClick={onClose}>×</button></header>
    <div className="editor-body">
      <label>Catalog name<input autoFocus required maxLength={100} value={draft.name} onChange={event => set('name', event.target.value)} /></label>
      <dl className="origin-country"><dt>Origin country</dt><dd>China</dd></dl>
      <small>All catalogs and search results are limited to shows originating in China.</small>
      <h3 className="field-section">Display languages</h3>
      <div className="field-grid three">{([
        ['titleLanguage', 'Title'], ['synopsisLanguage', 'Synopsis'], ['episodeNameLanguage', 'Episode'],
      ] as const).map(([key, label]) => <label key={key}>{label}<select value={draft[key]} onChange={event => set(key, event.target.value as DisplayLanguage)}><option value="zh-CN">Simplified Chinese</option><option value="en-US">English</option></select></label>)}</div>
      <small>Display language choices do not change which shows appear.</small>
      <h3 className="field-section">Genres</h3><GenrePicker title="Include genres" genres={lookups.genres} selected={draft.includeGenres} onChange={ids => set('includeGenres', ids)} /><small>Include shows with at least one selected genre. Leave empty to include all genres.</small>
      <details><summary>Exclude genres</summary><GenrePicker title="Exclude genres" genres={lookups.genres} selected={draft.excludeGenres} onChange={ids => set('excludeGenres', ids)} /></details>
      <h3 className="field-section">Sorting & ratings</h3>
      <div className="presets" role="group" aria-label="Preset"><span>Preset</span>{presets.map(preset => <button key={preset.name} type="button" onClick={() => setDraft(current => ({
        ...current, sortBy: preset.sortBy, voteAverageMin: 0, voteAverageMax: 10, voteCountMin: preset.voteCountMin,
        releasedOnly: preset.name === 'Latest' ? true : current.releasedOnly,
      }))}>{preset.name}</button>)}</div>
      <small>Quick sorting and rating defaults. Top Rated requires 25+ votes; Latest shows released titles.</small>
      <SortPicker value={draft.sortBy} onChange={value => set('sortBy', value)} /><div className="field-grid three">{number('voteAverageMin', 'Minimum rating', 10, 0.1)}{number('voteAverageMax', 'Maximum rating', 10, 0.1)}{number('voteCountMin', 'Minimum votes')}</div><datalist id="vote-counts">{[0, 10, 25, 50, 100, 500].map(value => <option value={value} key={value} />)}</datalist><small>Set a minimum vote count to keep little-rated titles from dominating.</small>
      <h3 className="field-section">First air date & runtime</h3><div className="field-grid"><label>From<input type="date" value={draft.firstAirDateFrom ?? ''} onChange={event => set('firstAirDateFrom', event.target.value || undefined)} /></label><label>To<input type="date" value={draft.firstAirDateTo ?? ''} onChange={event => set('firstAirDateTo', event.target.value || undefined)} /></label>{number('runtimeMin', 'Minimum runtime · minutes', 1440)}{number('runtimeMax', 'Maximum runtime · minutes', 1440)}</div>
      <Toggle label="Released only" checked={draft.releasedOnly} onChange={value => set('releasedOnly', value)} /><small>Exclude shows whose first episode airs after today.</small>
      {error && <p role="alert" className="error">{error}</p>}
    </div><footer className="editor-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Apply catalog</button></footer>
  </form></dialog>;
}
