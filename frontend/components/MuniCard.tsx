import { Tag, covTone } from './Tag'
import { Plus } from 'lucide-react'

export type MunicipioData = {
  id: number
  name: string
  zonas: number
  puestos: number
  mesas: number
  votantes: number
  testigos: number
  sinTestigo: number
  cov: number
  coord: string | null
}

const compact = (n: number) =>
  n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + 'M'
    : n >= 1_000
      ? Math.round(n / 1_000) + 'K'
      : String(n)

const fmt = (n: number) => n.toLocaleString('es-CO')

const covColor = (c: number) => (c >= 60 ? 'bg-ok' : c >= 30 ? 'bg-warn' : 'bg-danger')

export function MuniCard({ m, onClick }: { m: MunicipioData; onClick?: () => void }) {
  return (
    <div className="muni-card" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-card text-[15px]">{m.name}</div>
          <div className="font-mono text-[11px] text-text-3">
            {m.zonas}z · {m.puestos}p · {fmt(m.mesas)}m
          </div>
        </div>
        <Tag tone={covTone(m.cov)}>{m.cov}%</Tag>
      </div>

      {m.coord ? (
        <div className="flex items-center gap-1.5 text-[11.5px] text-text-2">
          <div className="avatar !w-[18px] !h-[18px] !text-[9px]">
            {m.coord
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          {m.coord}
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[11.5px] text-text-3 italic">
          <Plus className="w-[11px] h-[11px]" strokeWidth={1.5} /> Sin coordinador
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
        <Stat v={compact(m.votantes)} l="Votantes" />
        <Stat v={fmt(m.testigos)} l="Testigos" />
        <Stat v={fmt(m.sinTestigo)} l="Sin testigo" danger={m.sinTestigo > 0} />
      </div>

      <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={'h-full rounded-full transition-all ' + covColor(m.cov)}
          style={{ width: m.cov + '%' }}
        />
      </div>
    </div>
  )
}

function Stat({ v, l, danger }: { v: string; l: string; danger?: boolean }) {
  return (
    <div>
      <div
        className={
          'font-mono text-[14px] font-medium leading-tight ' +
          (danger ? 'text-danger-text' : 'text-text')
        }
      >
        {v}
      </div>
      <div className="text-[10px] text-text-3 tracking-wide mt-0.5">{l}</div>
    </div>
  )
}
