-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'REGIONAL_COORDINATOR', 'MUNICIPAL_COORDINATOR', 'ZONE_COORDINATOR', 'COMUNA_COORDINATOR', 'PUESTO_COORDINATOR');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('SUBREGION', 'MUNICIPIO', 'ZONA', 'COMUNA', 'PUESTO');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cipUid" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserScope" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" INTEGER NOT NULL,

    CONSTRAINT "UserScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subregion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Subregion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipio" (
    "id" SERIAL NOT NULL,
    "subregionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "divipola" TEXT NOT NULL,

    CONSTRAINT "Municipio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comuna" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "zonaId" INTEGER,

    CONSTRAINT "Comuna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zona" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Zona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Puesto" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "comunaId" INTEGER,
    "divipola" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "mesas" INTEGER NOT NULL DEFAULT 0,
    "votantes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Puesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testigo" (
    "id" SERIAL NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cedula" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abogado" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abogado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movilidad" (
    "id" SERIAL NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" INTEGER NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Movilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refrigerio" (
    "id" SERIAL NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refrigerio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparendo" (
    "id" SERIAL NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'abierto',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comparendo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_cipUid_key" ON "User"("cipUid");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserScope_scopeType_scopeId_idx" ON "UserScope"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserScope_userId_scopeType_scopeId_key" ON "UserScope"("userId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "Subregion_name_key" ON "Subregion"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Municipio_divipola_key" ON "Municipio"("divipola");

-- CreateIndex
CREATE INDEX "Municipio_subregionId_idx" ON "Municipio"("subregionId");

-- CreateIndex
CREATE INDEX "Comuna_zonaId_idx" ON "Comuna"("zonaId");

-- CreateIndex
CREATE UNIQUE INDEX "Comuna_municipioId_name_key" ON "Comuna"("municipioId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Zona_name_key" ON "Zona"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Puesto_divipola_key" ON "Puesto"("divipola");

-- CreateIndex
CREATE INDEX "Puesto_municipioId_idx" ON "Puesto"("municipioId");

-- CreateIndex
CREATE INDEX "Puesto_comunaId_idx" ON "Puesto"("comunaId");

-- CreateIndex
CREATE INDEX "Testigo_puestoId_idx" ON "Testigo"("puestoId");

-- CreateIndex
CREATE INDEX "Abogado_municipioId_idx" ON "Abogado"("municipioId");

-- CreateIndex
CREATE INDEX "Movilidad_scopeType_scopeId_idx" ON "Movilidad"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "Refrigerio_scopeType_scopeId_idx" ON "Refrigerio"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "Comparendo_scopeType_scopeId_idx" ON "Comparendo"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_ts_idx" ON "AuditLog"("ts");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipio" ADD CONSTRAINT "Municipio_subregionId_fkey" FOREIGN KEY ("subregionId") REFERENCES "Subregion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comuna" ADD CONSTRAINT "Comuna_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comuna" ADD CONSTRAINT "Comuna_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "Zona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puesto" ADD CONSTRAINT "Puesto_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puesto" ADD CONSTRAINT "Puesto_comunaId_fkey" FOREIGN KEY ("comunaId") REFERENCES "Comuna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testigo" ADD CONSTRAINT "Testigo_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testigo" ADD CONSTRAINT "Testigo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abogado" ADD CONSTRAINT "Abogado_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abogado" ADD CONSTRAINT "Abogado_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movilidad" ADD CONSTRAINT "Movilidad_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refrigerio" ADD CONSTRAINT "Refrigerio_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparendo" ADD CONSTRAINT "Comparendo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
