import { CoverageService } from './coverage.service.js';

describe('CoverageService', () => {
  let svc: CoverageService;

  beforeEach(() => {
    svc = new CoverageService();
  });

  // ── computePhysicalCoverage ────────────────────────────────────────────────
  // A16: mesasAsignadas = SUM(mesaFinal - mesaInicial + 1) WHERE mesaInicial IS NOT NULL
  // coberturaPct = FLOOR(mesasAsignadas / totalMesas * 100)

  describe('computePhysicalCoverage', () => {
    it('returns 0 when totalMesas is 0 (empty scope)', () => {
      expect(svc.computePhysicalCoverage(0, 0)).toBe(0);
    });

    it('returns 0 when totalMesas is 0 even with mesasAsignadas > 0', () => {
      expect(svc.computePhysicalCoverage(5, 0)).toBe(0);
    });

    it('returns 0 when no mesas are assigned', () => {
      expect(svc.computePhysicalCoverage(0, 10)).toBe(0);
    });

    it('returns 100 when all mesas are assigned', () => {
      expect(svc.computePhysicalCoverage(10, 10)).toBe(100);
    });

    it('returns 30 for partial assignment (floor, not round)', () => {
      // 3 / 10 = 0.3 → FLOOR(30) = 30
      expect(svc.computePhysicalCoverage(3, 10)).toBe(30);
    });

    it('floors rather than rounds (e.g. 0.99 → 99, not 100)', () => {
      // 99 / 100 = 0.99 → FLOOR(99) = 99
      expect(svc.computePhysicalCoverage(99, 100)).toBe(99);
    });

    it('mixed scope: some puestos covered, some not', () => {
      // puesto A: testigo covers mesas 1-5 → 5 assigned
      // puesto B: no testigos → 0 assigned
      // puesto C: testigo covers mesas 1-2 → 2 assigned
      // mesasAsignadas = 7, totalMesas = 5+8+3 = 16
      // FLOOR(7/16 * 100) = FLOOR(43.75) = 43
      expect(svc.computePhysicalCoverage(7, 16)).toBe(43);
    });

    it('overassignment is allowed (mesasAsignadas can exceed totalMesas)', () => {
      // Testigos with ranges that sum to more than puesto.mesas
      expect(svc.computePhysicalCoverage(12, 10)).toBe(120);
    });
  });

  // ── computeEstado ──────────────────────────────────────────────────────────
  // A16: no ratio logic — estado is purely assignment vs totalMesas.

  describe('computeEstado', () => {
    it('returns CUBIERTO when mesasAsignadas >= totalMesas', () => {
      expect(svc.computeEstado('ALTA', 100, 5, 5)).toBe('CUBIERTO');
      expect(svc.computeEstado('ALTA', 100, 6, 5)).toBe('CUBIERTO');
    });

    it('returns BAJO_RIESGO when votosTotal < 5 (regardless of coverage)', () => {
      expect(svc.computeEstado('ALTA', 4, 0, 5)).toBe('BAJO_RIESGO');
      expect(svc.computeEstado('MEDIA', 0, 0, 4)).toBe('BAJO_RIESGO');
    });

    it('returns BAJO_RIESGO when nivel is null (no PuestoPrioridad row)', () => {
      expect(svc.computeEstado(null, 100, 0, 5)).toBe('BAJO_RIESGO');
    });

    it('returns CRITICO for ALTA nivel when uncovered and votosTotal >= 5', () => {
      expect(svc.computeEstado('ALTA', 100, 2, 5)).toBe('CRITICO');
    });

    it('returns ATENCION for MEDIA nivel when uncovered and votosTotal >= 5', () => {
      expect(svc.computeEstado('MEDIA', 50, 1, 4)).toBe('ATENCION');
    });

    it('returns VIGILAR for BAJA nivel when uncovered and votosTotal >= 5', () => {
      expect(svc.computeEstado('BAJA', 20, 0, 3)).toBe('VIGILAR');
    });

    it('returns VIGILAR for unknown nivel when uncovered and votosTotal >= 5', () => {
      expect(svc.computeEstado('UNKNOWN', 20, 0, 3)).toBe('VIGILAR');
    });
  });
});
