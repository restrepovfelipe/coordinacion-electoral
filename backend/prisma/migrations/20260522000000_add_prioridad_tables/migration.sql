-- Phase 14: PuestoPrioridad (one row per puesto, CREEMOS+SN vote data + priority tier)
--           PrioridadConfig  (singleton row — admin-configurable thresholds)
--
-- Migration is additive only; no existing data is modified.

-- ── PuestoPrioridad ─────────────────────────────────────────────────────────

CREATE TABLE "PuestoPrioridad" (
    "id"              SERIAL          NOT NULL,
    "puestoId"        INTEGER         NOT NULL,
    "votosCreemos"    INTEGER         NOT NULL DEFAULT 0,
    "votosSN"         INTEGER         NOT NULL DEFAULT 0,
    "votosTotal"      INTEGER         NOT NULL DEFAULT 0,
    "mesasHistoricas" INTEGER         NOT NULL DEFAULT 0,
    "nivelPrioridad"  TEXT            NOT NULL DEFAULT 'BAJA',
    "notas"           TEXT,
    "updatedAt"       TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "PuestoPrioridad_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "PuestoPrioridad_puestoId_fkey"
        FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PuestoPrioridad_puestoId_key"
    ON "PuestoPrioridad"("puestoId");

CREATE INDEX "PuestoPrioridad_nivelPrioridad_idx"
    ON "PuestoPrioridad"("nivelPrioridad");

CREATE INDEX "PuestoPrioridad_votosTotal_idx"
    ON "PuestoPrioridad"("votosTotal" DESC);

-- ── PrioridadConfig ─────────────────────────────────────────────────────────

CREATE TABLE "PrioridadConfig" (
    "id"              SERIAL          NOT NULL,
    "umbralAlto"      INTEGER         NOT NULL DEFAULT 500,
    "umbralMedio"     INTEGER         NOT NULL DEFAULT 100,
    "ratioMesasAlta"  DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "ratioMesasMedia" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "ratioMesasBaja"  DOUBLE PRECISION NOT NULL DEFAULT 0.33,
    "updatedAt"       TIMESTAMP(3)    NOT NULL,
    "updatedById"     INTEGER,

    CONSTRAINT "PrioridadConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PrioridadConfig_updatedById_fkey"
        FOREIGN KEY ("updatedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── Seed: insert the singleton PrioridadConfig row with defaults ─────────────

INSERT INTO "PrioridadConfig"
    ("umbralAlto", "umbralMedio", "ratioMesasAlta", "ratioMesasMedia", "ratioMesasBaja", "updatedAt")
VALUES
    (500, 100, 0.5, 0.4, 0.33, NOW())
ON CONFLICT DO NOTHING;
