export type CovTone = 'ok' | 'warn' | 'danger'
export type EstadoTone = 'ok' | 'warn' | 'danger' | 'neutral'

export function covColor(pct: number): string {
  if (pct >= 60) return '#22c55e'
  if (pct >= 30) return '#f59e0b'
  return '#ef4444'
}

export function estadoColor(estado: string): string {
  switch (estado) {
    case 'CUBIERTO': return '#22c55e'
    case 'VIGILAR': return '#22c55e'
    case 'ATENCION': return '#f59e0b'
    case 'CRITICO': return '#ef4444'
    case 'BAJO_RIESGO': return '#94a3b8'
    default: return '#94a3b8'
  }
}
