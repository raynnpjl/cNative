import { sortOptions, type TmdbTvSort } from '../../../shared/config';

export function SortPicker({ value, onChange }: { value: TmdbTvSort; onChange: (value: TmdbTvSort) => void }) {
  return <label>Sort by<select value={value} onChange={event => {
    const match = sortOptions.find(([key]) => key === event.target.value);
    if (match) onChange(match[0]);
  }}>{sortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}
