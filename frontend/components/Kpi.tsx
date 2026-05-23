type KpiItem = { label: string; value: string | number; danger?: boolean }

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-strip">
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="kpi-label">{k.label}</div>
          <div className={'kpi-value' + (k.danger ? ' danger' : '')}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}
