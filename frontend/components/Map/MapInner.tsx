'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MarkerData = {
  id: number
  lat: number
  lon: number
  label: string
  color: string
  onClick?: () => void
}

export type MapProps = {
  center?: [number, number]
  zoom?: number
  markers?: MarkerData[]
  className?: string
}

export default function MapInner({ center = [6.2476, -75.5658], zoom = 9, markers = [], className = '' }: MapProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    const map = L.map(divRef.current, { center, zoom })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove existing marker layers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer)
    })

    for (const m of markers) {
      const marker = L.circleMarker([m.lat, m.lon], {
        radius: 8,
        fillColor: m.color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      })
      if (m.onClick) marker.on('click', m.onClick)
      marker.bindTooltip(m.label, { permanent: false, direction: 'top' })
      marker.addTo(map)
    }
  }, [markers])

  return <div ref={divRef} className={`h-full w-full ${className}`} />
}
