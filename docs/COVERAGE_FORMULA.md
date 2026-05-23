# Coverage Formula Reference (Amendment A16)

This document defines the two distinct coverage concepts used in the app and where each one applies.

---

## 1. Physical Coverage — `coberturaPct`

> "What fraction of mesas have been assigned to at least one testigo?"

### Formula (A16 — assignment-based)

Each testigo is assigned a contiguous range `[mesaInicial, mesaFinal]` (max 5 mesas, set by `AsignacionService.reassignPuesto()`).

```
For each Testigo t in puesto p where t.mesaInicial IS NOT NULL:
  mesasAsignadasP += (t.mesaFinal - t.mesaInicial + 1)

totalMesas      = SUM(p.mesas) over scope
mesasAsignadas  = SUM(mesasAsignadasP) over scope
coberturaPct    = totalMesas > 0 ? FLOOR(mesasAsignadas / totalMesas * 100) : 0
```

**Key properties:**
- Requires `AsignacionService.reassignPuesto()` to have run for the puesto
- Uses `FLOOR`, not `ROUND`
- Independent of `PrioridadConfig` ratios
- Applies identically at every scope: puesto → commune → zone → municipio → subregion

**Production baseline (2026-05-22, pre-backfill):**
MEDELLIN: 5 592 totalMesas, 3 306 mesasSinTestigo → coberturaPct ≈ 40–41

### Implementation

**Backend:** `CoverageService.computePhysicalCoverage(mesasAsignadas, totalMesas)`  
**Backend SQL:** `SUM(CASE WHEN mesaInicial IS NOT NULL THEN mesaFinal - mesaInicial + 1 ELSE 0 END)` per aggregate scope  
**Frontend:** Assignment table per puesto shows `mesasAsignadas / totalMesas`; global `_coveragePct()` used as fallback

Used in:
- `GET /api/dashboard/stats` → `MunicipioStat.coberturaPct`
- `GET /api/dashboard/prioridad/puestos` → `PuestoPrioridadItem.coberturaPct`
- `GET /api/dashboard/prioridad/mapa` → `MapaPuesto` (estado computation)

---

## 2. Policy Coverage — `estado` per Puesto

> "Has this puesto been fully covered by the mesa assignment?"

### Formula (A16 — assignment-based, no ratios)

```
estado = !nivelPrioridad OR votosTotal < 5  → BAJO_RIESGO
       | mesasAsignadas >= puesto.mesas     → CUBIERTO
       | nivelPrioridad = 'ALTA'             → CRITICO
       | nivelPrioridad = 'MEDIA'            → ATENCION
       | otherwise                           → VIGILAR
```

**Key properties:**
- Does NOT use `PrioridadConfig.ratioMesasAlta/Media/Baja` for estado
- Ratios are preserved only for `testigosRequeridos` display (informational)
- `criticosUncovered` = puestos with `nivelPrioridad = 'ALTA'` AND `mesasAsignadas < mesas`
- Applies **only at the individual puesto level**

### Implementation

**Backend:** `CoverageService.computeEstado(nivel, votosTotal, mesasAsignadas, totalMesas)`  
Used in:
- `GET /api/dashboard/prioridad/puestos` → `PuestoPrioridadItem.estado`
- `GET /api/dashboard/prioridad/mapa` → `MapaPuesto.estado`
- `MunicipioStat.criticosUncovered`

---

## 3. Mesa Assignment — `AsignacionService`

Runs automatically on every testigo create/update/delete/bulkAssign.  
Can also be triggered manually: `POST /api/asignacion/recalcular/:puestoId`.

### Algorithm

```
testigos = SELECT id FROM Testigo WHERE puestoId = ? ORDER BY id ASC
for i, testigo in enumerate(testigos):
  mesaInicial = i * 5 + 1
  mesaFinal   = MIN((i+1) * 5, puesto.mesas)
  if mesaInicial > puesto.mesas:
    testigo.mesaInicial = NULL
    testigo.mesaFinal   = NULL
  else:
    testigo.mesaInicial = mesaInicial
    testigo.mesaFinal   = mesaFinal
```

Constraints: `mesaInicial <= mesaFinal`, `mesaFinal - mesaInicial + 1 <= 5`, `mesaFinal <= puesto.mesas`.

---

## Summary

| Field | Formula type | Ratios used? | Scope |
|-------|-------------|-------------|-------|
| `coberturaPct` | Assignment (mesasAsignadas / totalMesas) | No | Any aggregate |
| `estado` | Policy (mesasAsignadas >= totalMesas, then by nivel) | No | Per puesto only |
| `testigosRequeridos` | Display only (ratio-based) | Yes | Per puesto only |
| `criticosUncovered` | Assignment (mesasAsignadas < mesas) | No | Per municipio aggregate |
