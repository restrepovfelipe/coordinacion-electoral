'use client'

import { useRouter } from 'next/navigation'
import { useDashboardStats, type MunicipioStat } from '@/lib/api/dashboard'
import { useSubregiones, useMunicipios, slugify } from '@/lib/api/ref-data'
import { MuniCard, type MunicipioData } from '@/components/MuniCard'
import { KpiStrip } from '@/components/Kpi'

function statToMuniData(stat: MunicipioStat): MunicipioData {
  return {
    id: stat.municipioId,
    name: stat.municipioNombre,
    zonas: 0,
    puestos: 0,
    mesas: stat.mesasCount,
    votantes: 0,
    testigos: stat.testigosCount,
    sinTestigo: 0,
    cov: stat.coberturaPct,
    coord: null,
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats()
  const { data: subregiones, isLoading: subLoading, isError: subError } = useSubregiones()
  const { data: municipios, isLoading: muniLoading, isError: muniError } = useMunicipios()

  const isLoading = statsLoading || subLoading || muniLoading
  const hasError = statsError || subError || muniError

  const header = (
    <>
      <p className="kicker">Antioquia · Colombia 2026</p>
      <h1 className="h1-display mt-1">Dashboard</h1>
    </>
  )

  if (hasError) {
    return (
      <div className="p-6">
        {header}
        <p className="mt-6 text-text-3">Error al cargar los datos. Por favor recarga la página.</p>
      </div>
    )
  }

  if (isLoading || !stats || !subregiones || !municipios) {
    return (
      <div className="p-6">
        {header}
        <p className="mt-6 text-text-3">Cargando datos de Antioquia…</p>
      </div>
    )
  }

  const totalTestigos = stats.reduce((acc, s) => acc + s.testigosCount, 0)
  const totalMesas = stats.reduce((acc, s) => acc + s.mesasCount, 0)
  const totalCubiertas = stats.reduce((acc, s) => acc + s.mesasCubiertas, 0)
  const globalCov = totalMesas > 0 ? Math.round((totalCubiertas / totalMesas) * 100) : 0
  const totalCriticos = stats.reduce((acc, s) => acc + s.criticosUncovered, 0)

  const kpiItems = [
    { label: 'Testigos', value: totalTestigos },
    { label: 'Mesas', value: totalMesas },
    { label: 'Cobertura', value: `${globalCov}%` },
    { label: 'Críticos sin cubrir', value: totalCriticos, danger: totalCriticos > 0 },
  ]

  // Build a map of municipioId -> subregionId
  const muniSubregionMap = new Map<number, number>()
  for (const m of municipios) {
    muniSubregionMap.set(m.id, m.subregionId)
  }

  // Group stats by subregionId
  const grouped = new Map<number, MunicipioStat[]>()
  for (const stat of stats) {
    const subregionId = muniSubregionMap.get(stat.municipioId)
    if (subregionId === undefined) continue
    const existing = grouped.get(subregionId)
    if (existing) {
      existing.push(stat)
    } else {
      grouped.set(subregionId, [stat])
    }
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        {header}
        <div className="mt-4">
          <KpiStrip items={kpiItems} />
        </div>
      </div>

      {subregiones.map((sub) => {
        const group = grouped.get(sub.id)
        if (!group || group.length === 0) return null
        return (
          <section key={sub.id}>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-3 mb-3">
              {sub.name}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {group.map((stat) => (
                <MuniCard
                  key={stat.municipioId}
                  m={statToMuniData(stat)}
                  onClick={() => router.push('/municipio/' + slugify(stat.municipioNombre))}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
