-- Migration: seed coordinator preload data (COORD_PRELOAD)
-- Data sourced from frontend COORD_PRELOAD constant (js/data.js)
-- Idempotent: all UPDATEs guarded by coordinadorAdHocNombre IS NULL
-- Tables: "Zona" = zone groupings, "Comuna" = communes, "Puesto" = voting centers
-- 5 zona + 21 commune + 65 puesto = 91 UPDATE statements

-- MEDELLIN
UPDATE "Zona" SET "coordinadorAdHocNombre" = 'SERGIO ANGAR', "coordinadorAdHocTelefono" = '3216446647'
  WHERE name = 'Zona Nororiental' AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Zona" SET "coordinadorAdHocNombre" = 'CESAR LOPEZ', "coordinadorAdHocTelefono" = '3046761773'
  WHERE name = 'Zona Centro Oriental' AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Zona" SET "coordinadorAdHocNombre" = 'CARLOS ALBERTO ZULUAGA', "coordinadorAdHocTelefono" = '3102695051'
  WHERE name = 'Zona Centro Occidental' AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Zona" SET "coordinadorAdHocNombre" = 'MÓNICA GÓMEZ', "coordinadorAdHocTelefono" = '3207328365'
  WHERE name = 'Zona Sur Oriental' AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Zona" SET "coordinadorAdHocNombre" = 'JUAN CAMILO', "coordinadorAdHocTelefono" = '3122084143'
  WHERE name = 'Zona Sur Occidental' AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'Francisco Robledo (Jaiberth)', "coordinadorAdHocTelefono" = '3042688931'
  WHERE name = '01COMUNA 1 POPULAR' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'Andrés Cano (Sebastián Arboleda)', "coordinadorAdHocTelefono" = '3207328365'
  WHERE name = '02COMUNA 2 SANTA CRUZ' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'DAYAN MARULANDA', "coordinadorAdHocTelefono" = '3217315809'
  WHERE name = '03COMUNA 3 MANRIQUE' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'WILMER PELAEZ (Deporte)', "coordinadorAdHocTelefono" = '3217315809'
  WHERE name = '04COMUNA 4 ARANJUEZ' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'JAIRO MARULANDA', "coordinadorAdHocTelefono" = '3127072644'
  WHERE name = '05COMUNA 5 CASTILLA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'LUIS RAMOS', "coordinadorAdHocTelefono" = '3012628358'
  WHERE name = '06COMUNA 6 DOCE DE OCTUBRE' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'DUVAN MEJIA', "coordinadorAdHocTelefono" = '3016827690'
  WHERE name = '07COMUNA 7 ROBLEDO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'Isodoro Manco (Jaiberth)', "coordinadorAdHocTelefono" = '3193036630'
  WHERE name = '08COMUNA 8 VILLA HERMOSA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'JUAN CAMILO GAVIRIA', "coordinadorAdHocTelefono" = '3194628101'
  WHERE name = '09COMUNA 9 BUENOS AIRES' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'LAZARO ALEJANDRO MORALES', "coordinadorAdHocTelefono" = '3205523977'
  WHERE name = '10COMUNA 10 LA CANDELARIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'MAXIMILIANO NAVARRO', "coordinadorAdHocTelefono" = '3043909292'
  WHERE name = '11COMUNA 11 LAURELES' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'SANDRA ZAPATA', "coordinadorAdHocTelefono" = '3204710737'
  WHERE name = '12COMUNA 12 LA AMERICA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'FREDY SOMBATÍ', "coordinadorAdHocTelefono" = '3006788054'
  WHERE name = '13COMUNA 13 SAN JAVIER' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'ALEJANDRO GUERRA', "coordinadorAdHocTelefono" = '3502974533'
  WHERE name = '14COMUNA 14 EL POBLADO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'Alonso Aguirre (JAIBERTH)', "coordinadorAdHocTelefono" = '3182210067'
  WHERE name = '15COMUNA 15 GUAYABAL' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'SEBASTAIN PEREZ', "coordinadorAdHocTelefono" = '3027569126'
  WHERE name = '16COMUNA 16 BELEN' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'DUVALIER MARULANDA', "coordinadorAdHocTelefono" = '3127576836'
  WHERE name = '17CORREGIMIENT O ALTAVISTA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'WILLIAM PIEDRAHITA', "coordinadorAdHocTelefono" = '3024460777'
  WHERE name = '19CORREGIMIENT O PALMITAS' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'MAURICIO LONDOÑO', "coordinadorAdHocTelefono" = '3206262785'
  WHERE name = '21CORREGIMIENT O SANTA ELENA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'Guillermo Leon Henao (Jaiberth)', "coordinadorAdHocTelefono" = '3117372097'
  WHERE name = '18CORR. SAN ANTONIO DE PRADO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Comuna" SET "coordinadorAdHocNombre" = 'MAURIA EUGENIA BEDOYA', "coordinadorAdHocTelefono" = '3022503174'
  WHERE name = '20CORREGIMIENT O SAN CRISTOBAL' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Valentino (Jaiberth)', "coordinadorAdHocTelefono" = '3237933338'
  WHERE name = 'I.E. DINAMARCA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Claudia Flores (Jaiberth)', "coordinadorAdHocTelefono" = '3122030958'
  WHERE name = 'I.E. DOCE DE OCTUBRE' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Alexander Giraldo (Jaiberth)', "coordinadorAdHocTelefono" = '3217831729'
  WHERE name = 'I.E.MAESTRO FERNANDO BOTERO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Luz Elcy Loaiza (Jaiberth)', "coordinadorAdHocTelefono" = '3052742348'
  WHERE name = 'SEC. ESC. EL PEDREGAL' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Carlos Marquez (Jaiberth)', "coordinadorAdHocTelefono" = '3005737044'
  WHERE name = 'I.E.FE Y ALEGRIA SAN JOSE' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Andrés Rodríguez (Jaiberth)', "coordinadorAdHocTelefono" = '3113423447'
  WHERE name = 'COL MAYOR DE ANTIOQUIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'MAURICIO ÁLVAREZ', "coordinadorAdHocTelefono" = '3162970470'
  WHERE name = 'I.E.LA INDEPENDENCIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Pedro Zapata (Jaiberth)', "coordinadorAdHocTelefono" = '3226805440'
  WHERE name = 'I.E. GILBERTO ALZATE AVENDAÑO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Angela María Ibarbo (Jaiberth)', "coordinadorAdHocTelefono" = '3127840719'
  WHERE name = 'I.E. CAMPO VALDES' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Marta Cecilia Leal (Jaiberth)', "coordinadorAdHocTelefono" = '3150660602'
  WHERE name = 'I.E.SAN JUAN BOSCO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Claudia Fundación (Jaiberth)', "coordinadorAdHocTelefono" = '3192321137'
  WHERE name = 'I.E. JAVIERA LONDOÑO SEVILLA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Pedro Zapata (Jaiberth)', "coordinadorAdHocTelefono" = '3226805440'
  WHERE name = 'IE FE Y ALEGRIA LUIS AMIGO MORAVIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Edwin Loaiza (Jaiberth)', "coordinadorAdHocTelefono" = '3046352174'
  WHERE name = 'IE DIEGO ECHAVARRIA MISAS' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Francisco Robledo', "coordinadorAdHocTelefono" = '3042688931'
  WHERE name = 'SEC. ESC. LA ESPERANZA No 2' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Lina Díaz', "coordinadorAdHocTelefono" = '3148841014'
  WHERE name = 'SEC. ESC. FIDEL ANTONIO SALDARRIAGA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Sergio Angar', "coordinadorAdHocTelefono" = '3216446647'
  WHERE name = 'I.E. HERNAN TORO AGUDELO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Isodoro Manco', "coordinadorAdHocTelefono" = '3193036630'
  WHERE name = 'I.E. JUAN DE DIOS CARVAJAL' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Fernando Soto', "coordinadorAdHocTelefono" = '3246468717'
  WHERE name = 'IE FELIX HENAO BOTERO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Mauricio Mora', "coordinadorAdHocTelefono" = '3043481746'
  WHERE name = 'I.E.GUADALUPANO LA SALLE' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Jairo Patiño', "coordinadorAdHocTelefono" = '3127398595'
  WHERE name = 'I.E. MANUEL JOSÉ CAYZEDO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Víctor Julio', "coordinadorAdHocTelefono" = '3147085827'
  WHERE name = 'COLISEO SANTA ELENA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Numan', "coordinadorAdHocTelefono" = '3127179900'
  WHERE name = 'ESC NORMAL SUPERIOR ANTIOQUEÑA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'María Elena', "coordinadorAdHocTelefono" = '3145482495'
  WHERE name = 'CASA DE GOBIERNO SANTA ELENA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Juan Pablo Macíaz', "coordinadorAdHocTelefono" = '3013143882'
  WHERE name = 'COL. SAN IGNACIO DE LOYOLA - SD INFANTIL' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Maximiliano Navarro', "coordinadorAdHocTelefono" = '3043909292'
  WHERE name = 'SEC.ESC. AGRUPACION COLOMBIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Paulo Gómez', "coordinadorAdHocTelefono" = '3006971106'
  WHERE name = 'LICEO SALAZAR Y HERRERA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Marisol Ciprian', "coordinadorAdHocTelefono" = '3216032853'
  WHERE name = 'I.E. MATER DEI' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Valentina', "coordinadorAdHocTelefono" = '3148943618'
  WHERE name = 'SEC. ESC. PEDRO DE CASTRO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Diana Cano', "coordinadorAdHocTelefono" = '3004360333'
  WHERE name = 'I.E. MARCO FIDEL SUAREZ' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Lady', "coordinadorAdHocTelefono" = '3136047757'
  WHERE name = 'SEC ESC JUAN DE DIOS ARANZAZU' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Cesar García', "coordinadorAdHocTelefono" = '3202723679'
  WHERE name = 'CORP. UNIVERSITARIA ADVENTISTA - UNAC' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Andrés Zuluaga', "coordinadorAdHocTelefono" = '3137428385'
  WHERE name = 'COLEGIO BETHLEMITAS' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Luis Fernando Álvarez', "coordinadorAdHocTelefono" = '3113394935'
  WHERE name = 'UNIVERSIDAD DE MEDELLIN' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Adolfo Peláez', "coordinadorAdHocTelefono" = '3145069212'
  WHERE name = 'SEC. ESC. MONSEÑOR PERDOMO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Sandra Piedrahita', "coordinadorAdHocTelefono" = '3188048479'
  WHERE name = 'I.E JUAN XXIII' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Lady Poso', "coordinadorAdHocTelefono" = '3216939100'
  WHERE name = 'I.E. CARLOS VIECO ORTIZ' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Roman Espinoza', "coordinadorAdHocTelefono" = '3165282982'
  WHERE name = 'COL.MARYMOUNT' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Laura Hurtado', "coordinadorAdHocTelefono" = '3246840673'
  WHERE name = 'I.E. INEM JOSE FELIX DE RESTREPO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Juan Camilo', "coordinadorAdHocTelefono" = '3122084143'
  WHERE name = 'SEC ESC CRISTO REY APOLO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Verónica Hernández', "coordinadorAdHocTelefono" = '3116028862'
  WHERE name = 'POLITECNICO JAIME ISAZA CADAVID' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Jennifer Cardona', "coordinadorAdHocTelefono" = '3226113625'
  WHERE name = 'I.E. LA SALLE DE CAMPOAMOR' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Alonso Aguirre', "coordinadorAdHocTelefono" = '3182210067'
  WHERE name = 'I.E. CAMILO C. RESTREPO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Wilson Restrepo', "coordinadorAdHocTelefono" = '3162968504'
  WHERE name = 'I.E.CRISTO REY' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Sebastián Pérez', "coordinadorAdHocTelefono" = '3027569126'
  WHERE name = 'I.E.JUAN MARIA CESPEDES' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Liliana', "coordinadorAdHocTelefono" = '3114865049'
  WHERE name = 'I.E. OCTAVIO HARRY - JACQUELINE KENNEDY' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Sara María Giraldo', "coordinadorAdHocTelefono" = '3137379546'
  WHERE name = 'I.E. GUILLERMO VALENCIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Edite Hernández', "coordinadorAdHocTelefono" = '3127899497'
  WHERE name = 'C.E. MARIA PAULINA TABORDA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Juan Camilo Londoño', "coordinadorAdHocTelefono" = '3043796548'
  WHERE name = 'IE YERMO Y PARRES' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Guillermo León Henao', "coordinadorAdHocTelefono" = '3117372097'
  WHERE name = 'CENTRO EDUCATIVO EL MANZANILLO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Pedro Nel', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'I.E. MONTECARLO GUILLERMO GAVIRIA CORREA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Luz Dary Loaiza', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'INSTITUTO FERRINI - SEDE ROBLEDO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Camilo Guzman', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'I.E. NUEVO HORIZONTE - PAULO VI' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Yamile', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'SENA - SEDE BUENOS AIRES' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Mónica Gómez', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'SEC. ESC. GUILLERMO ECHAVARRIA MISAS' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Patricia', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'SEC. ESC. REPUBLICA DE PANAMA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Brayan', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'I.E.BENJAMIN HERRERA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Fredy Granada', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'COLEGIO LATINO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Carlos Aritza', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'SEC. ESC. SANTA LUCIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Verónica Fernández', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'SEC.ESC.EL SOCORRO' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Dani Gonzales', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'SEC. ESC. ARZOBISPO GARCIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Edwin Torrez', "coordinadorAdHocTelefono" = '3046352174'
  WHERE name = 'I.E. LUCRECIO JARAMILLO VELEZ' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Andrés', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'I.E.SANTA ROSA DE LIMA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Jairo', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'I.E. SAN FRANCISCO DE ASIS' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'MEDELLIN') AND "coordinadorAdHocNombre" IS NULL;

-- ENVIGADO
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Fabián R', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'COLEGIO BENEDITINO DE SANTA MARIA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'ENVIGADO') AND "coordinadorAdHocNombre" IS NULL;
UPDATE "Puesto" SET "coordinadorAdHocNombre" = 'Lina María', "coordinadorAdHocTelefono" = NULL
  WHERE name = 'UNIVERSIDAD EIA. SEDE ZUÑIGA' AND "municipioId" = (SELECT id FROM "Municipio" WHERE name = 'ENVIGADO') AND "coordinadorAdHocNombre" IS NULL;
