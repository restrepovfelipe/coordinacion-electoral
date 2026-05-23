import { KpiStrip } from '@/components/Kpi'
import { Tag } from '@/components/Tag'
import { MuniCard } from '@/components/MuniCard'

export default function Home() {
  return (
    <div className="min-h-screen bg-bg p-8 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-[26px] h-[26px] rounded-md bg-accent text-white grid place-items-center font-mono font-semibold text-[11px]">
          CE
        </div>
        <h1 className="text-[20px] font-semibold tracking-tightish">
          Coordinación Electoral — Design System
        </h1>
      </div>

      <KpiStrip
        items={[
          { label: 'Testigos', value: '7 296' },
          { label: 'Confirmados', value: '4 821' },
          { label: 'Sin puesto', value: 713, danger: true },
          { label: 'Cobertura', value: '41%' },
          { label: 'Puestos críticos', value: 38, danger: true },
        ]}
      />

      <div className="flex gap-2 flex-wrap">
        <Tag tone="ok">CUBIERTO</Tag>
        <Tag tone="warn">ATENCIÓN</Tag>
        <Tag tone="danger">CRÍTICO</Tag>
        <Tag tone="accent">VIGILAR</Tag>
        <Tag tone="default">BAJO RIESGO</Tag>
      </div>

      <div className="muni-grid">
        <MuniCard
          m={{
            id: 1,
            name: 'MEDELLÍN',
            zonas: 6,
            puestos: 421,
            mesas: 5592,
            votantes: 1830000,
            testigos: 3421,
            sinTestigo: 321,
            cov: 41,
            coord: 'Coordinador Regional',
          }}
        />
        <MuniCard
          m={{
            id: 2,
            name: 'BELLO',
            zonas: 0,
            puestos: 89,
            mesas: 1120,
            votantes: 420000,
            testigos: 512,
            sinTestigo: 88,
            cov: 55,
            coord: null,
          }}
        />
        <MuniCard
          m={{
            id: 3,
            name: 'ITAGÜÍ',
            zonas: 0,
            puestos: 61,
            mesas: 780,
            votantes: 290000,
            testigos: 620,
            sinTestigo: 0,
            cov: 78,
            coord: 'Ana Gómez',
          }}
        />
      </div>

      <p className="text-text-3 text-[12px]">
        Geist Sans + Geist Mono · Accent #0F4C81 · Bootstrap OK
      </p>
    </div>
  )
}
