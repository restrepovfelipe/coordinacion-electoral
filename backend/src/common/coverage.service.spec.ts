import { CoverageService } from './coverage.service.js';

describe('CoverageService', () => {
  let svc: CoverageService;

  beforeEach(() => {
    svc = new CoverageService();
  });

  // ── computePhysicalCoverage ────────────────────────────────────────────────

  describe('computePhysicalCoverage', () => {
    it('returns 0 when totalMesas is 0 (empty scope)', () => {
      expect(svc.computePhysicalCoverage(0, 0)).toBe(0);
    });

    it('returns 0 when totalMesas is 0 even with mesasCubiertas > 0', () => {
      expect(svc.computePhysicalCoverage(5, 0)).toBe(0);
    });

    it('returns 0 when no testigos (mesasCubiertas = 0)', () => {
      expect(svc.computePhysicalCoverage(0, 10)).toBe(0);
    });

    it('returns 100 when all mesas are covered', () => {
      expect(svc.computePhysicalCoverage(10, 10)).toBe(100);
    });

    it('returns 30 for partial coverage (floor, not round)', () => {
      // 3 / 10 = 0.3 → FLOOR(30) = 30
      expect(svc.computePhysicalCoverage(3, 10)).toBe(30);
    });

    it('floors rather than rounds (e.g. 0.99 → 99, not 100)', () => {
      // 99 / 100 = 0.99 → FLOOR(99) = 99
      expect(svc.computePhysicalCoverage(99, 100)).toBe(99);
    });

    it('mixed scope: some puestos covered, some not', () => {
      // puesto A: 5 testigos, 5 mesas → 5 cubiertas
      // puesto B: 0 testigos, 8 mesas → 0 cubiertas
      // puesto C: 2 testigos, 3 mesas → 2 cubiertas
      // mesasCubiertas = 5+0+2 = 7, totalMesas = 5+8+3 = 16
      // FLOOR(7/16 * 100) = FLOOR(43.75) = 43
      expect(svc.computePhysicalCoverage(7, 16)).toBe(43);
    });
  });

  // ── cappedMesasCovered ─────────────────────────────────────────────────────

  describe('cappedMesasCovered', () => {
    it('returns testigos when testigos < mesas (no cap)', () => {
      expect(svc.cappedMesasCovered(3, 5)).toBe(3);
    });

    it('returns mesas when testigos > mesas (cap kicks in)', () => {
      expect(svc.cappedMesasCovered(8, 5)).toBe(5);
    });

    it('returns mesas when testigos === mesas', () => {
      expect(svc.cappedMesasCovered(5, 5)).toBe(5);
    });

    it('returns 0 when no testigos', () => {
      expect(svc.cappedMesasCovered(0, 10)).toBe(0);
    });

    it('returns 0 when mesas = 0 (inactive puesto)', () => {
      expect(svc.cappedMesasCovered(3, 0)).toBe(0);
    });
  });

  // ── requiredTestigos ───────────────────────────────────────────────────────

  describe('requiredTestigos', () => {
    it('uses ratioAlta for ALTA nivel', () => {
      // CEIL(10 * 0.5) = 5
      expect(svc.requiredTestigos(10, 'ALTA', 0.5, 0.4, 0.33)).toBe(5);
    });

    it('uses ratioMedia for MEDIA nivel', () => {
      // CEIL(10 * 0.4) = 4
      expect(svc.requiredTestigos(10, 'MEDIA', 0.5, 0.4, 0.33)).toBe(4);
    });

    it('uses ratioBaja for BAJA nivel', () => {
      // CEIL(10 * 0.33) = CEIL(3.3) = 4
      expect(svc.requiredTestigos(10, 'BAJA', 0.5, 0.4, 0.33)).toBe(4);
    });

    it('uses CEIL not FLOOR (rounds up partial mesas)', () => {
      // CEIL(7 * 0.5) = CEIL(3.5) = 4
      expect(svc.requiredTestigos(7, 'ALTA', 0.5, 0.4, 0.33)).toBe(4);
    });
  });

  // ── computeEstado ──────────────────────────────────────────────────────────

  describe('computeEstado', () => {
    it('returns CUBIERTO when testigos >= required', () => {
      expect(svc.computeEstado('ALTA', 100, 5, 5)).toBe('CUBIERTO');
      expect(svc.computeEstado('ALTA', 100, 6, 5)).toBe('CUBIERTO');
    });

    it('returns BAJO_RIESGO when votosTotal < 5 (regardless of coverage)', () => {
      expect(svc.computeEstado('ALTA', 4, 0, 5)).toBe('BAJO_RIESGO');
      expect(svc.computeEstado('MEDIA', 0, 0, 4)).toBe('BAJO_RIESGO');
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
  });
});
