import type { Lookups } from '../../../shared/config';

export function CountryPicker({ value, countries, onChange }: { value?: string; countries: Lookups['countries']; onChange: (value: string | undefined) => void }) {
  const display = new Intl.DisplayNames(['en'], { type: 'region' });
  const priority = ['CN', 'HK', 'TW', 'SG'];
  const sorted = [...countries].sort((a, b) => {
    const first = priority.indexOf(a.iso_3166_1); const second = priority.indexOf(b.iso_3166_1);
    return (first === -1 ? 100 : first) - (second === -1 ? 100 : second) || a.english_name.localeCompare(b.english_name);
  });
  return <label>Origin country<select value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
    <option value="">Any country</option>
    {value && !countries.some(country => country.iso_3166_1 === value) && <option value={value}>{display.of(value)}</option>}
    {sorted.map(country => <option key={country.iso_3166_1} value={country.iso_3166_1}>{display.of(country.iso_3166_1) ?? country.english_name}</option>)}
  </select></label>;
}
