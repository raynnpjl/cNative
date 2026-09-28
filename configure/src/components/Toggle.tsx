export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="toggle-label"><input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} /><span className="toggle-track" aria-hidden="true" /><span>{label}</span></label>;
}
