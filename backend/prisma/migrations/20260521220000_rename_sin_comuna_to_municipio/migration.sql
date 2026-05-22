-- Rename "Sin comuna" to municipio name for municipios with exactly one
-- comarca that has the placeholder name. Medellín (22 comunas) is naturally
-- excluded by the COUNT = 1 predicate.
UPDATE "Comuna" c
SET    name = m.name
FROM   "Municipio" m
WHERE  c."municipioId" = m.id
  AND  TRIM(LOWER(c.name)) = 'sin comuna'
  AND  (SELECT COUNT(*) FROM "Comuna" WHERE "municipioId" = m.id) = 1;
