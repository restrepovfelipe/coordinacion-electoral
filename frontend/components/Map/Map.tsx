'use client'

import dynamic from 'next/dynamic'
import type { MapProps } from './MapInner'

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center text-text-3 text-[13px]">
      Cargando mapa...
    </div>
  ),
})

export function Map(props: MapProps) {
  return <MapInner {...props} />
}
