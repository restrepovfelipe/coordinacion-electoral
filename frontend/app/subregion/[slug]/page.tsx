'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { useDashboardStats, type MunicipioStat } from '@/lib/api/dashboard'
import {
  useSubregiones,
  useMunicipios,
  slugify,
  resolveSubregionBySlug,
} from '@/lib/api/ref-data'
import { MuniCard, type MunicipioData } from '@/components/MuniCard'

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

export default function SubregionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: subregiones, isLoading: subLoading } = useSubregiones()
  const { data: municipios, isLoading: muniLoading } = useMunicipios()

  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set())
  const [expandLoaded, setExpandLoaded] = useState(false)

  const isLoading = statsLoading || subLoading || muniLoading
  const allLoaded = !isLoading && !!stats && !!subregiones && !!municipios

  // Load persisted expand state from localStorage once data is ready
  useEffect(() => {
    if (!allLoaded || expandLoaded) return
    try {
      const stored = localStorage.getItem(`expand.subregion.${slug}`)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setExpandedSlugs(new Set(parsed as string[]))
        }
      }
    } catch {
      // ignore parse errors
    }
    setExpandLoaded(true)
  }, [allLoaded, expandLoaded, slug])

  if (!allLoaded) {
    return (
      <div className="p-6">
        <p className="text-[12px] text-text-3 mb-4">Antioquia / ...</p>
        <p className="text-text-3">Cargando...</p>
      </div>
    )
  }

  const subregion = resolveSubregionBySlug(subregiones, slug)
  if (!subregion) {
    notFound()
  }

  // Filter municipios belonging to this subregion
  const subMuniIds = new Set(
    municipios.filter((m) => m.subregionId === subregion.id).map((m) => m.id),
  )

  const subStats = stats.filter((s) => subMuniIds.has(s.municipioId))

  function toggle(muniSlug: string) {
    setExpandedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(muniSlug)) {
        next.delete(muniSlug)
      } else {
        next.add(muniSlug)
      }
      try {
        localStorage.setItem(`expand.subregion.${slug}`, JSON.stringify(Array.from(next)))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  function expandAll() {
    const all = new Set(subStats.map((s) => slugify(s.municipioNombre)))
    setExpandedSlugs(all)
    try {
      localStorage.setItem(`expand.subregion.${slug}`, JSON.stringify(Array.from(all)))
    } catch {
      // ignore
    }
  }

  function collapseAll() {
    setExpandedSlugs(new Set())
    try {
      localStorage.setItem(`expand.subregion.${slug}`, JSON.stringify([]))
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[12px] text-text-3 mb-1">
          Antioquia / {subregion.nombre}
        </p>
        <h1 className="h1-display">{subregion.nombre}</h1>

        <div className="flex gap-2 mt-4">
          <button className="btn btn-sm" onClick={expandAll}>
            Expandir todo
          </button>
          <button className="btn btn-sm btn-ghost" onClick={collapseAll}>
            Contraer todo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {subStats.map((stat) => {
          const muniSlug = slugify(stat.municipioNombre)
          const isExpanded = expandedSlugs.has(muniSlug)
          return (
            <MuniCard
              key={stat.municipioId}
              m={statToMuniData(stat)}
              collapsed={!isExpanded}
              onClick={() => {
                if (!isExpanded) {
                  toggle(muniSlug)
                } else {
                  router.push('/municipio/' + muniSlug)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
