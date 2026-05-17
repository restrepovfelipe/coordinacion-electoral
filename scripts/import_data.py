"""
Script para importar datos de Excel/PDF al COORD_PRELOAD de data.js
"""
import json, re, random, sys, os, openpyxl, pdfplumber

sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
random.seed(42)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─── 1. LEER DATA.JS ────────────────────────────────────────────────────────
with open(os.path.join(BASE, 'js', 'data.js'), encoding='utf-8') as f:
    content = f.read()

def extract_json(text, marker):
    idx = text.find(marker) + len(marker)
    depth = 0; i = idx
    while i < len(text):
        if text[i] in '{[': depth += 1
        elif text[i] in '}]': depth -= 1
        if depth == 0: break
        i += 1
    return json.loads(text[idx:i+1]), idx, i+1

coord_preload, cp_idx, cp_end = extract_json(content, 'COORD_PRELOAD=')
raw, _, _ = extract_json(content, 'const RAW=')

# ─── 2. BUILD PUESTO LOOKUPS ─────────────────────────────────────────────────
# pk → commune, name; commune → list of pks
pk_to_commune = {}    # pk_str → ck
pk_to_name    = {}    # pk_str → puesto_name
commune_pks   = {}    # (muni, ck) → [pk_str, ...]
all_puestos   = {}    # muni → {ck → [pk_str]}

for muni, comunas in raw.items():
    all_puestos[muni] = {}
    for ck, puestos in comunas.items():
        key = (muni, ck)
        commune_pks[key] = []
        all_puestos[muni][ck] = []
        for p in puestos:
            pk = f"{p['dd']}_{p['mm']}_{p['zz']}_{p['pp']}"
            pk_to_commune[pk] = ck
            pk_to_name[pk] = p['puesto']
            commune_pks[key].append(pk)
            all_puestos[muni][ck].append(pk)

# ─── 3. INICIALIZAR EL NUEVO COORD_PRELOAD ───────────────────────────────────
# Start fresh from existing, we'll update values
new_cp = json.loads(json.dumps(coord_preload))
if 'MEDELLIN' not in new_cp:
    new_cp['MEDELLIN'] = {}
if 'comunas' not in new_cp['MEDELLIN']:
    new_cp['MEDELLIN']['comunas'] = {}
if 'puestos' not in new_cp['MEDELLIN']:
    new_cp['MEDELLIN']['puestos'] = {}
if 'zonas' not in new_cp['MEDELLIN']:
    new_cp['MEDELLIN']['zonas'] = {}
if 'ENVIGADO' not in new_cp:
    new_cp['ENVIGADO'] = {'comunas': {}, 'puestos': {}, 'zonas': {}}

# Track used pks (already assigned as puesto coordinators)
used_pks = set(new_cp['MEDELLIN']['puestos'].keys())
used_pks |= set(new_cp.get('ENVIGADO', {}).get('puestos', {}).keys())

# Set of names already in puesto coords (normalized for matching)
def normalize(name):
    return re.sub(r'[^a-záéíóúñ ]', '', name.lower().strip())

def name_in_puestos(name, muni='MEDELLIN'):
    n = normalize(name)
    puestos_data = new_cp.get(muni, {}).get('puestos', {})
    for pk, pd in puestos_data.items():
        if n in normalize(pd.get('coord', '')):
            return True
    return False

def is_commune_coord(name, muni='MEDELLIN'):
    n = normalize(name)
    comunas_data = new_cp.get(muni, {}).get('comunas', {})
    for ck, cd in comunas_data.items():
        if n in normalize(cd.get('coord', '')):
            return True
    return False

def assign_puesto(name, phone, communes_list, muni='MEDELLIN'):
    """Assign person to a random available puesto in their communes."""
    available = []
    for ck in communes_list:
        key = (muni, ck)
        if key not in commune_pks:
            continue
        for pk in commune_pks[key]:
            if pk not in used_pks:
                available.append(pk)
    if not available:
        # If all puestos are taken, pick any from communes
        for ck in communes_list:
            key = (muni, ck)
            if key in commune_pks:
                available.extend(commune_pks[key])
        if not available:
            print(f'  !! No puestos found for {name} in communes {communes_list}')
            return None
    chosen = random.choice(available)
    used_pks.add(chosen)
    if muni not in new_cp:
        new_cp[muni] = {'comunas': {}, 'puestos': {}, 'zonas': {}}
    if 'puestos' not in new_cp[muni]:
        new_cp[muni]['puestos'] = {}
    new_cp[muni]['puestos'][chosen] = {'coord': name, 'phone': phone}
    print(f'  ✓ {name} → {chosen} ({pk_to_name.get(chosen, "?")})')
    return chosen

# ─── 4. COMMUNE NUMBER → KEY MAP ─────────────────────────────────────────────
C = {
    '1':  '01COMUNA 1 POPULAR',
    '2':  '02COMUNA 2 SANTA CRUZ',
    '3':  '03COMUNA 3 MANRIQUE',
    '4':  '04COMUNA 4 ARANJUEZ',
    '5':  '05COMUNA 5 CASTILLA',
    '6':  '06COMUNA 6 DOCE DE OCTUBRE',
    '7':  '07COMUNA 7 ROBLEDO',
    '8':  '08COMUNA 8 VILLA HERMOSA',
    '9':  '09COMUNA 9 BUENOS AIRES',
    '10': '10COMUNA 10 LA CANDELARIA',
    '11': '11COMUNA 11 LAURELES',
    '12': '12COMUNA 12 LA AMERICA',
    '13': '13COMUNA 13 SAN JAVIER',
    '14': '14COMUNA 14 EL POBLADO',
    '15': '15COMUNA 15 GUAYABAL',
    '16': '16COMUNA 16 BELEN',
    '17': '17CORREGIMIENT O ALTAVISTA',
    '18': '18CORR. SAN ANTONIO DE PRADO',
    '19': '19CORREGIMIENT O PALMITAS',
    '20': '20CORREGIMIENT O SAN CRISTOBAL',
    '21': '21CORREGIMIENT O SANTA ELENA',
    '60': '20CORREGIMIENT O SAN CRISTOBAL',   # user: 60 = San Cristóbal
    '90': '21CORREGIMIENT O SANTA ELENA',      # user: 90 = Santa Elena
}

def parse_communes(val):
    """Parse commune value from Excel → list of commune keys."""
    if val is None:
        return []
    s = str(val).strip()
    # Check for Envigado/La Frontera
    if 'envigado' in s.lower():
        return ['ENVIGADO']
    if 'frontera' in s.lower() or 'la frontera' in s.lower():
        return [C['13']]
    # Split by comma
    parts = [p.strip() for p in s.replace(';', ',').split(',')]
    result = []
    for p in parts:
        p = p.strip()
        if p in C:
            key = C[p]
            if key not in result:
                result.append(key)
        elif p:
            print(f'  ?? Unknown commune code: {p!r}')
    return result

# ─── 5. PROCESAR DIA D MDE PUESTOS ──────────────────────────────────────────
print('\n=== DIA D MDE PUESTOS: Coordinadores de comunas y zonas ===')

# Map Excel commune field → commune key
def excel_commune_to_key(val):
    if val is None:
        return None
    s = str(val).replace('\n', ' ').strip()
    # Match patterns like "01COMUNA 1 POPULAR", "17CORREGIMIENT O ALTAVISTA"
    for ck in all_puestos.get('MEDELLIN', {}).keys():
        pass  # we'll use regex
    # Extract commune number from start
    m = re.match(r'^(\d+)', s)
    if m:
        num = m.group(1).lstrip('0') or '0'
        if num in C:
            return C[num]
    if 'ESPECIAL' in s.upper() or 'ESPECIALES' in s.upper():
        return 'ESPECIALES'
    return None

# Zone coordinator tracking
MEDELLIN_ZONAS_MAP = {
    '01COMUNA 1 POPULAR':           'Zona Nororiental',
    '02COMUNA 2 SANTA CRUZ':        'Zona Nororiental',
    '03COMUNA 3 MANRIQUE':          'Zona Nororiental',
    '04COMUNA 4 ARANJUEZ':          'Zona Nororiental',
    '05COMUNA 5 CASTILLA':          'Zona Noroccidental',
    '06COMUNA 6 DOCE DE OCTUBRE':   'Zona Noroccidental',
    '07COMUNA 7 ROBLEDO':           'Zona Noroccidental',
    '20CORREGIMIENT O SAN CRISTOBAL':'Zona Noroccidental',
    '19CORREGIMIENT O PALMITAS':    'Zona Noroccidental',
    '08COMUNA 8 VILLA HERMOSA':     'Zona Centro Oriental',
    '09COMUNA 9 BUENOS AIRES':      'Zona Centro Oriental',
    '10COMUNA 10 LA CANDELARIA':    'Zona Centro Oriental',
    'SIN COMUNA':                   'Zona Centro Oriental',
    '11COMUNA 11 LAURELES':         'Zona Centro Occidental',
    '12COMUNA 12 LA AMERICA':       'Zona Centro Occidental',
    '13COMUNA 13 SAN JAVIER':       'Zona Centro Occidental',
    '17CORREGIMIENT O ALTAVISTA':   'Zona Centro Occidental',
    '14COMUNA 14 EL POBLADO':       'Zona Sur Oriental',
    '21CORREGIMIENT O SANTA ELENA': 'Zona Sur Oriental',
    '15COMUNA 15 GUAYABAL':         'Zona Sur Occidental',
    '16COMUNA 16 BELEN':            'Zona Sur Occidental',
    '18CORR. SAN ANTONIO DE PRADO': 'Zona Sur Occidental',
}

data_file = [f for f in os.listdir(os.path.join(BASE, 'data')) if 'PUESTOS' in f.upper()][0]
wb_puestos = openpyxl.load_workbook(os.path.join(BASE, 'data', data_file))
ws_puestos = wb_puestos.active

# Read all rows
rows_puestos = list(ws_puestos.iter_rows(min_row=2, values_only=True))

current_ck = None
current_zona_coord = None
current_zona_phone = None

# Updated commune coordinators from Excel
commune_updates = {
    '01COMUNA 1 POPULAR':            ('Francisco Robledo (Jaiberth)', '3042688931'),
    '02COMUNA 2 SANTA CRUZ':         ('Andrés Cano (Sebastián Arboleda)', '3207328365'),
    '03COMUNA 3 MANRIQUE':           ('DAYAN MARULANDA', '3217315809'),
    '04COMUNA 4 ARANJUEZ':           ('WILMER PELAEZ (Deporte)', '3217315809'),
    '05COMUNA 5 CASTILLA':           ('JAIRO MARULANDA', '3127072644'),
    '06COMUNA 6 DOCE DE OCTUBRE':    ('LUIS RAMOS', '3012628358'),
    '07COMUNA 7 ROBLEDO':            ('DUVAN MEJIA', '3016827690'),
    '08COMUNA 8 VILLA HERMOSA':      ('Isodoro Manco (Jaiberth)', '3193036630'),
    '09COMUNA 9 BUENOS AIRES':       ('JUAN CAMILO GAVIRIA', '3194628101'),
    '10COMUNA 10 LA CANDELARIA':     ('LAZARO ALEJANDRO MORALES', '3205523977'),
    '11COMUNA 11 LAURELES':          ('MAXIMILIANO NAVARRO', '3043909292'),
    '12COMUNA 12 LA AMERICA':        ('SANDRA ZAPATA', '3204710737'),
    '13COMUNA 13 SAN JAVIER':        ('FREDY SOMBATÍ', '3006788054'),
    '14COMUNA 14 EL POBLADO':        ('ALEJANDRO GUERRA', '3502974533'),
    '15COMUNA 15 GUAYABAL':          ('Alonso Aguirre (JAIBERTH)', '3182210067'),
    '16COMUNA 16 BELEN':             ('SEBASTAIN PEREZ', '3027569126'),
    '17CORREGIMIENT O ALTAVISTA':    ('DUVALIER MARULANDA', '3127576836'),
    '19CORREGIMIENT O PALMITAS':     ('WILLIAM PIEDRAHITA', '3024460777'),
    '21CORREGIMIENT O SANTA ELENA':  ('MAURICIO LONDOÑO', '3206262785'),
    '18CORR. SAN ANTONIO DE PRADO':  ('Guillermo Leon Henao (Jaiberth)', '3117372097'),
    '20CORREGIMIENT O SAN CRISTOBAL':('MAURIA EUGENIA BEDOYA', '3022503174'),
    # SIN COMUNA / ESPECIALES → no coordinator (leave empty)
}

# Zone coordinators from Excel
zona_coords = {
    'Zona Nororiental':       ('SERGIO ANGAR', '3216446647'),
    'Zona Centro Oriental':   ('CESAR LOPEZ', '3046761773'),
    'Zona Centro Occidental': ('CARLOS ALBERTO ZULUAGA', '3102695051'),
    'Zona Sur Oriental':      ('MÓNICA GÓMEZ', '3207328365'),
    'Zona Sur Occidental':    ('JUAN CAMILO', '3122084143'),
}

# Apply commune coordinator updates
for ck, (coord, phone) in commune_updates.items():
    if ck not in new_cp['MEDELLIN']['comunas']:
        new_cp['MEDELLIN']['comunas'][ck] = {}
    new_cp['MEDELLIN']['comunas'][ck]['coord'] = coord
    new_cp['MEDELLIN']['comunas'][ck]['phone'] = phone
    print(f'  Commune coord: {ck} → {coord}')

# Apply zone coordinator updates
for zona, (coord, phone) in zona_coords.items():
    new_cp['MEDELLIN']['zonas'][zona] = {'coord': coord, 'phone': phone}
    print(f'  Zona coord: {zona} → {coord}')

# Build set of commune coordinators (for skip logic)
comm_coords_set = set()
for ck, cd in new_cp['MEDELLIN']['comunas'].items():
    if cd.get('coord'):
        comm_coords_set.add(normalize(cd['coord']))

# ─── 6. PROCESAR ADLE ────────────────────────────────────────────────────────
print('\n=== ADLE: Líderes → asignación aleatoria de puestos ===')

adle_file = [f for f in os.listdir(os.path.join(BASE, 'data')) if 'ADLE' in f.upper()][0]
wb_adle = openpyxl.load_workbook(os.path.join(BASE, 'data', adle_file))
ws_adle = wb_adle.active

adle_leaders = []
for row in ws_adle.iter_rows(min_row=4, values_only=True):
    nombre = row[0]
    comuna_val = row[1]
    if not nombre or not str(nombre).strip():
        continue
    nombre = str(nombre).strip()
    if not comuna_val:
        continue
    adle_leaders.append((nombre, comuna_val))

print(f'Total ADLE leaders: {len(adle_leaders)}')

for nombre, comuna_val in adle_leaders:
    # Parse communes
    communes = parse_communes(comuna_val)
    if not communes:
        print(f'  ?? {nombre}: no communes from {comuna_val!r}')
        continue

    # Check if Envigado
    if communes == ['ENVIGADO']:
        # Check if already in ENVIGADO puestos
        if name_in_puestos(nombre, 'ENVIGADO'):
            print(f'  ⤷ {nombre} (ENVIGADO): ya tiene puesto')
            continue
        env_pks = all_puestos.get('ENVIGADO', {}).get('SIN COMUNA', [])
        available = [pk for pk in env_pks if pk not in used_pks]
        if not available:
            available = env_pks
        chosen = random.choice(available) if available else None
        if chosen:
            used_pks.add(chosen)
            if 'puestos' not in new_cp['ENVIGADO']:
                new_cp['ENVIGADO']['puestos'] = {}
            new_cp['ENVIGADO']['puestos'][chosen] = {'coord': nombre, 'phone': ''}
            print(f'  ✓ {nombre} (ENVIGADO) → {chosen} ({pk_to_name.get(chosen, "?")})')
        continue

    # Check if already a commune coordinator → skip
    n = normalize(nombre)
    is_comm = any(n in c for c in comm_coords_set)
    if is_comm:
        print(f'  ⤷ {nombre}: es coordinador de comuna → skip')
        continue

    # Check if already in MEDELLIN puestos
    if name_in_puestos(nombre, 'MEDELLIN'):
        print(f'  ⤷ {nombre}: ya tiene puesto asignado')
        continue

    # Assign to random puesto
    assign_puesto(nombre, '', communes, 'MEDELLIN')

# ─── 7. PROCESAR PDF LÍDERES ZONALES ────────────────────────────────────────
print('\n=== PDF: Líderes Zonales → asignación aleatoria de puestos ===')

pdf_file = [f for f in os.listdir(os.path.join(BASE, 'data')) if f.lower().endswith('.pdf')][0]

# Barrio → commune key mapping (from research)
BARRIO_COMMUNE = {
    'santo domingo':        C['1'],
    'santa cruz':           C['2'],
    'aranjuez':             C['4'],
    'manrique':             C['3'],
    'campo valdez':         C['4'],
    'campo valdés':         C['4'],
    'doce de octubre':      C['6'],
    'robledo':              C['7'],
    'san cristóbal':        C['20'],
    'san cristobal':        C['20'],
    'castilla':             C['5'],
    'pedregal':             C['6'],
    'boyaca las brisas':    C['5'],
    'boyacá las brisas':    C['5'],
    'villa hermosa':        C['8'],
    'enciso':               C['8'],
    'buenos aires':         C['9'],
    'san elena':            C['21'],
    'santa elena':          C['21'],
    'simón bolivar':        C['12'],
    'simon bolivar':        C['12'],
    'simón bolívar':        C['12'],
    'san joaquin':          C['11'],
    'san joaquín':          C['11'],
    'barrio cristóbal':     C['12'],
    'barrio cristobal':     C['12'],
    'velódromo':            C['11'],
    'velodrómo':            C['11'],
    'florida nueva':        C['11'],
    'calasanz':             C['12'],
    'floresta':             C['12'],
    'santa lucía':          C['12'],
    'santa lucia':          C['12'],
    'san javier':           C['13'],
    'juan xxiii':           C['13'],
    'poblado':              C['14'],
    'frontera':             C['13'],
    'la frontera':          C['13'],
    'guayabal':             C['15'],
    'antonio nariño':       C['13'],
    'antonio narino':       C['13'],
    'belén':                C['16'],
    'belen':                C['16'],
    'b. la nubia':          C['16'],
    'la nubia':             C['16'],
    'altavista':            C['17'],
    'belén rincón':         C['16'],
    'belen rincon':         C['16'],
    'belén rincon':         C['16'],
    'san antonio de p':     C['18'],
    'san antonio':          C['18'],
    'guayabal )':           C['15'],  # trailing paren in PDF
}

def barrio_to_commune(barrio):
    b = barrio.lower().strip().rstrip(')')
    for key, val in BARRIO_COMMUNE.items():
        if key in b or b in key:
            return val
    return None

pdf_leaders = []
with pdfplumber.open(os.path.join(BASE, 'data', pdf_file)) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if not text:
            continue
        for line in text.split('\n'):
            # Skip headers
            if any(h in line for h in ['LÍDERES ZONALES', 'ZONA ', 'TELÉFONO', 'BARRIO']):
                continue
            # Parse: Name Phone Barrio Occupation
            # Lines look like: "Pedro Zapata 322 6805440 Aranjuez Líder"
            parts = line.strip().split()
            if len(parts) < 3:
                continue
            # Find where the phone number starts (digits with spaces)
            phone_match = re.search(r'\b\d{3}\s?\d{4}\s?\d{3,4}\b', line)
            if phone_match:
                name = line[:phone_match.start()].strip()
                after_phone = line[phone_match.end():].strip()
                phone = re.sub(r'\s', '', phone_match.group())
                # Rest: barrio + occupation
                # Last word(s) are occupation (Líder, JAC, JAL, etc.)
                words = after_phone.split()
                # Find where occupation starts
                ocupaciones = {'Líder', 'líder', 'JAC', 'JAL', 'Lider', 'Ambientalis'}
                occ_idx = len(words)
                for idx2, w in enumerate(words):
                    if w in ocupaciones or w.startswith('Lider') or w.startswith('líder'):
                        occ_idx = idx2
                        break
                barrio = ' '.join(words[:occ_idx]).strip()
                if name and barrio:
                    pdf_leaders.append((name, phone, barrio))

print(f'Total PDF leaders parsed: {len(pdf_leaders)}')

for name, phone, barrio in pdf_leaders:
    ck = barrio_to_commune(barrio)
    if not ck:
        print(f'  ?? {name}: barrio desconocido "{barrio}"')
        continue

    # Check if already a commune coordinator → skip
    n = normalize(name)
    is_comm = any(n in c or c in n for c in comm_coords_set)
    if is_comm:
        print(f'  ⤷ {name}: es coordinador de comuna → skip')
        continue

    # Check if already has a puesto
    if name_in_puestos(name, 'MEDELLIN'):
        print(f'  ⤷ {name}: ya tiene puesto asignado')
        continue

    assign_puesto(name, phone, [ck], 'MEDELLIN')

# ─── 8. ESCRIBIR EL RESULTADO ────────────────────────────────────────────────
print('\n=== RESULTADO FINAL ===')
print(f'MEDELLIN comunas: {len(new_cp["MEDELLIN"]["comunas"])}')
print(f'MEDELLIN puestos: {len(new_cp["MEDELLIN"]["puestos"])}')
print(f'MEDELLIN zonas:   {len(new_cp["MEDELLIN"]["zonas"])}')
print(f'ENVIGADO puestos: {len(new_cp.get("ENVIGADO", {}).get("puestos", {}))}')

# Output JSON for verification
out_path = os.path.join(BASE, 'scripts', 'coord_preload_new.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(new_cp, f, ensure_ascii=False, indent=2)
print(f'\nGuardado en: {out_path}')
