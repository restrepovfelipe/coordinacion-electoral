# Coverage Formula Reference

This document defines the two distinct coverage concepts used in the app and where each one applies.

---

## 1. Physical Coverage — `coberturaPct`

> "What percentage of mesas have at least one testigo assigned?"

### Formula (applies to any scope)

```
For each Puesto p in scope:
  testigosInP   = COUNT(Testigo WHERE puestoId = p.id)
  mesasCubP     = MIN(testigosInP, p.numeroMesas)   // 1 testigo → 1 mesa, capped

totalMesas      = SUM(p.numeroMesas)
mesasCubiertas  = SUM(mesasCubP)
coberturaPct    = totalMesas > 0 ? FLOOR(mesasCubiertas / totalMesas * 100) : 0
```

**Key properties:**
- Excess testigos beyond a puesto's mesas do NOT increase coverage (cap at `p.mesas`)
- Uses `FLOOR`, not `ROUND`
- Independent of `PrioridadConfig` ratios
- Applies identically at every scope: puesto → commune → zone → municipio → subregion → department

**Production validation (2026-05-22):**
MEDELLIN: 5 592 totalMesas, 3 306 mesasSinTestigo → 2 286 mesasCubiertas → `coberturaPct = 40`

### Implementation

**Backend:** `CoverageService.computePhysicalCoverage(mesasCubiertas, totalMesas)`  
**Backend SQL:** `SUM(LEAST(COUNT(testigos_per_puesto), puesto.mesas))` per aggregate scope  
**Frontend:** `_coveragePct(mesasCubiertas, totMesas)` in `js/app.js`

Used in:
- `GET /api/dashboard/stats` → `MunicipioStat.coberturaPct`
- `GET /api/dashboard/prioridad/puestos` → `PuestoPrioridadItem.coberturaPct`
- All drill-down views (commune, zone, overview cards)

---

## 2. Policy Coverage — `estado` per Puesto

> "Has this puesto met its required testigo quota given its priority level?"

### Formula

```
requiredTestigos = CEIL(puesto.mesas × ratio)
  where ratio = ratioMesasAlta  (if nivelPrioridad = 'ALTA')
              | ratioMesasMedia (if nivelPrioridad = 'MEDIA')
              | ratioMesasBaja  (if nivelPrioridad = 'BAJA')

estado = testigosAsignados >= requiredTestigos  → CUBIERTO
       | votosTotal < 5                         → BAJO_RIESGO
       | nivelPrioridad = 'ALTA'                → CRITICO
       | nivelPrioridad = 'MEDIA'               → ATENCION
       | otherwise                              → VIGILAR
```

**Key properties:**
- Driven by `PrioridadConfig.ratioMesasAlta/Media/Baja`
- Applies **only at the individual puesto level** — never aggregated
- Does NOT affect `coberturaPct` anywhere

### Implementation

**Backend:** `CoverageService.requiredTestigos()` + `CoverageService.computeEstado()`  
Used in:
- `GET /api/dashboard/prioridad/puestos` → `PuestoPrioridadItem.estado`, `testigosRequeridos`
- `GET /api/dashboard/prioridad/mapa` → `MapaPuesto.estado`, `testigosRequeridos`
- `MunicipioStat.criticosUncovered` (count of ALTA puestos below their required threshold)

---

## Summary

| Field | Formula type | Ratios used? | Scope |
|-------|-------------|-------------|-------|
| `coberturaPct` | Physical (mesas with ≥1 testigo) | No | Any aggregate |
| `estado` | Policy (testigos vs required quota) | Yes | Per puesto only |
| `testigosRequeridos` | Policy | Yes | Per puesto only |
| `criticosUncovered` | Policy | Yes (ratioAlta) | Per municipio aggregate |
