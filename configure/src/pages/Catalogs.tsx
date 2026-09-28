import { useState } from 'react';
import type { CatalogConfig, Lookups } from '../../../shared/config';
import { CatalogList } from '../components/CatalogList';
import { CatalogEditor } from '../components/CatalogEditor';
import { duplicateCatalog, newCatalog } from '../catalog-actions';

export function Catalogs({ catalogs, lookups, onChange }: { catalogs: CatalogConfig[]; lookups: Lookups; onChange: (catalogs: CatalogConfig[]) => void }) {
  const [editing, setEditing] = useState<CatalogConfig>();
  const [deleted, setDeleted] = useState<{ catalog: CatalogConfig; index: number }>();
  return <section><div className="section-heading"><div><span className="eyebrow">CURATED BY YOU</span><h2>Your catalogs <span className="count">{catalogs.length}</span></h2><p>Shape your shelves. Find your next story.</p></div><span className="subtle-note">Drag to reorder · Top appears first</span></div>
    {deleted && <div className="notice" role="status">“{deleted.catalog.name}” removed.<button onClick={() => { const restored = [...catalogs]; restored.splice(deleted.index, 0, deleted.catalog); onChange(restored); setDeleted(undefined); }}>Undo</button></div>}
    <CatalogList catalogs={catalogs} onChange={onChange} onEdit={setEditing} onDuplicate={catalog => { if (catalogs.length < 50) onChange([...catalogs, duplicateCatalog(catalog)]); }} onDelete={catalog => { setDeleted({ catalog, index: catalogs.findIndex(item => item.id === catalog.id) }); onChange(catalogs.filter(item => item.id !== catalog.id)); }} />
    {!catalogs.length && <div className="empty-state"><span aria-hidden="true">架</span><h3>A shelf waiting for a story.</h3><p>Add a catalog to start exploring. Search remains available.</p></div>}
    <button className="add-catalog" disabled={catalogs.length >= 50} onClick={() => setEditing(newCatalog())}><span>＋</span> Add Catalog <small>Choose a country, a mood, an era.</small></button>
    <div className="search-note"><span aria-hidden="true">⌕</span><div><strong>One search. Every story.</strong><p>A dedicated search catalog is always included. Search in Chinese or by a title’s international name.</p></div><span className="badge">Always on</span></div>
    {editing && <CatalogEditor key={editing.id} catalog={editing} lookups={lookups} onClose={() => setEditing(undefined)} onSave={catalog => { onChange(catalogs.some(item => item.id === catalog.id) ? catalogs.map(item => item.id === catalog.id ? catalog : item) : [...catalogs, catalog]); setEditing(undefined); }} />}
  </section>;
}
