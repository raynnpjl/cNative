import type { Lookups } from '../../../shared/config';

export function GenrePicker({ title, genres, selected, onChange }: { title: string; genres: Lookups['genres']; selected: number[]; onChange: (ids: number[]) => void }) {
  return <fieldset className="genre-picker"><legend>{title}</legend><div className="genre-options">
    {genres.map(genre => <button type="button" key={genre.id} aria-pressed={selected.includes(genre.id)} className={selected.includes(genre.id) ? 'genre selected' : 'genre'} onClick={() => onChange(selected.includes(genre.id) ? selected.filter(id => id !== genre.id) : [...selected, genre.id])}>{genre.name}</button>)}
    {!genres.length && <small>Genre choices load from TMDB once credentials are configured.</small>}
  </div></fieldset>;
}
