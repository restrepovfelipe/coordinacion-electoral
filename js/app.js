// ═══ XSS ESCAPE HELPER ═══
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══ WRITE ERROR BADGE ═══
// Shows a temporary sync-badge error when a background API write fails.
function _onWriteError(label, err) {
  console.error(label, err?.status ?? err?.code ?? err?.message, err);
  if (typeof setSyncBadge === 'function') {
    setSyncBadge('error', '⚠ Error al guardar');
    setTimeout(() => setSyncBadge('', 'Sin cambios'), 5000);
  }
}

// ═══ PUESTO ID CACHE ═══
// Cache: municipio name → { puestoName → backendId }
const _puestoIdCache = {};

// Load puesto backend IDs for a municipality from the API
async function loadPuestoIds(muniName) {
  if (!window.api || !window.CURRENT_USER) return;
  if (_puestoIdCache[muniName]) return; // already loaded

  try {
    // Get municipio ID first
    const munis = await api.get(`/municipios`);
    const muni = munis.find(m => m.name === muniName || m.name === muniName.toUpperCase());
    if (!muni) return;

    // Get puestos for this municipio
    const puestos = await api.get(`/puestos?municipioId=${muni.id}`);
    _puestoIdCache[muniName] = {};
    _puestoIdCache[muniName]._muniId = muni.id;
    for (const p of puestos) {
      _puestoIdCache[muniName][p.name.toUpperCase()] = p.id;
    }
  } catch (err) {
    console.warn('Could not load puesto IDs for', muniName, err && err.status);
  }
}

function getPuestoBackendId(muniName, puestoRawName) {
  const cache = _puestoIdCache[muniName];
  if (!cache) return null;
  // Try exact match first, then uppercase match
  return cache[puestoRawName] || cache[puestoRawName?.toUpperCase()] || null;
}

// ═══ STATE ═══
let ST = {};
let _initialized = false;
const ALL_MUNIS = Object.values(REGIONES).flat();
let CLOSED_REGIONS = new Set(Object.keys(REGIONES));
const OPEN_ITABS = {};

function loadLocalSt() {
  try { return JSON.parse(localStorage.getItem('amva26v2') || '{}'); } catch (e) { return {}; }
}
function saveLocalSt() {
  try { localStorage.setItem('amva26v2', JSON.stringify(ST)); } catch (e) {}
}

function gs(n) {
  if (!ST[n]) ST[n] = { coord: '', phone: '', comunas: {}, puestos: {}, testigos: {}, movilidad: {}, abogados: {}, refrigerios: {}, comparendos: {} };
  return ST[n];
}

function _innerPreload() {
  let changed = false;
  const forceUpdate = !ST._preload_version || ST._preload_version < PRELOAD_VERSION;

  // Preload movilidad (carros/motos + responsable) per commune
  for (const [muni, comunas] of Object.entries(MOV_PRELOAD)) {
    for (const [ck, mov] of Object.entries(comunas)) {
      const s = gs(muni);
      if (!s.movilidad) s.movilidad = {};
      if (!s.movilidad[ck] || (!s.movilidad[ck].responsables?.length && !s.movilidad[ck].motos_nec && !s.movilidad[ck].carros_nec)) {
        s.movilidad[ck] = {
          motos_nec: mov.motos_nec || 0,
          carros_nec: mov.carros_nec || 0,
          responsables: mov.responsables || []
        };
        changed = true;
      }
    }
  }

  // Preload zone, commune, and puesto coordinators
  for (const [muni, data] of Object.entries(COORD_PRELOAD)) {
    const s = gs(muni);
    // Zone coordinators (Medellín zonas geográficas)
    if (!s.zonas) s.zonas = {};
    for (const [zonaNombre, zd] of Object.entries(data.zonas || {})) {
      if (!s.zonas[zonaNombre]) s.zonas[zonaNombre] = {};
      if (forceUpdate || (!s.zonas[zonaNombre].coord && !s.zonas[zonaNombre].phone)) {
        s.zonas[zonaNombre].coord = zd.coord || '';
        s.zonas[zonaNombre].phone = zd.phone || '';
        changed = true;
      }
    }
    // Commune coordinators
    if (!s.comunas) s.comunas = {};
    for (const [ck, cd] of Object.entries(data.comunas || {})) {
      if (!s.comunas[ck]) s.comunas[ck] = {};
      if (forceUpdate || (!s.comunas[ck].coord && !s.comunas[ck].phone)) {
        s.comunas[ck].coord = cd.coord || '';
        s.comunas[ck].phone = cd.phone || '';
        changed = true;
      }
    }
    // Puesto coordinators
    if (!s.puestos) s.puestos = {};
    for (const [pk_str, pd] of Object.entries(data.puestos || {})) {
      if (!s.puestos[pk_str]) s.puestos[pk_str] = {};
      if (forceUpdate || (!s.puestos[pk_str].coord && !s.puestos[pk_str].phone)) {
        s.puestos[pk_str].coord = pd.coord || '';
        s.puestos[pk_str].phone = pd.phone || '';
        changed = true;
      }
    }
  }

  if (forceUpdate) { ST._preload_version = PRELOAD_VERSION; changed = true; }
  if (changed) saveLocalSt();
  return forceUpdate;
}

function pk(p) { return `${p.dd}_${p.mm}_${p.zz}_${p.pp}`; }
function cid(n, ck) { return 'cc_' + btoa(unescape(encodeURIComponent(n + ck))).replace(/[^a-z0-9]/gi, ''); }


// ═══ SIDEBAR ═══
let CUR = null, OPEN_CC = new Set(), OPEN_Z = new Set();

function getAccessibleMunis() {
  // Returns array of municipality names the current user can see
  if (!window.CURRENT_USER) return Object.keys(RAW);

  const role = window.CURRENT_USER.role;

  // SUPER_ADMIN and REGIONAL_COORDINATOR see all
  if (role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR') {
    return Object.keys(RAW);
  }

  // Others: filter based on scopes
  // For now, show all municipalities (we don't have a scope→municipality mapping in the frontend)
  // TODO: filter by user scopes when scopeId→municipio mapping is available
  return Object.keys(RAW);
}
function filterSB(q) {
  const ql = (q || '').toUpperCase();
  document.querySelectorAll('.sb-item').forEach(el => { el.style.display = el.dataset.nm.includes(ql) ? '' : 'none'; });
  document.querySelectorAll('.sb-region-header').forEach(rh => {
    const anyVisible = [...rh.nextElementSibling?.querySelectorAll('.sb-item') || []].some(el => el.style.display !== 'none');
    rh.style.display = (ql && !anyVisible) ? 'none' : '';
    if (rh.nextElementSibling) rh.nextElementSibling.style.display = (ql && !anyVisible) ? 'none' : '';
  });
}
function toggleSB() { const sb = document.querySelector('.sb'); const collapsed = sb.classList.toggle('collapsed'); document.querySelectorAll('.sb-toggle').forEach(btn => { btn.textContent = collapsed ? '☰' : '✕'; }); }
function buildSB() {
  const list = document.getElementById('sb-list'); list.innerHTML = '';
  const accessibleMunis = new Set(getAccessibleMunis());
  Object.entries(REGIONES).forEach(([region, munis]) => {
    const validMusis = munis.filter(n => RAW[n] && accessibleMunis.has(n));
    if (!validMusis.length) return;
    const isOpen = !CLOSED_REGIONS.has(region);
    const rh = document.createElement('div');
    rh.className = 'sb-region-header' + (isOpen ? ' open' : '');
    rh.innerHTML = `<span>${region}</span><span class="sb-region-toggle">${isOpen ? '▾' : '▸'}</span>`;
    rh.onclick = () => { if (CLOSED_REGIONS.has(region)) CLOSED_REGIONS.delete(region); else CLOSED_REGIONS.add(region); buildSB(); };
    list.appendChild(rh);
    const grp = document.createElement('div');
    grp.className = 'sb-region-group';
    if (!isOpen) grp.style.display = 'none';
    validMusis.forEach(n => {
      const s = gs(n);
      const totP = Object.values(RAW[n]).reduce((a, c) => a + c.length, 0);
      const d = document.createElement('div');
      d.className = 'sb-item' + (n === CUR ? ' on' : ''); d.dataset.nm = n; d.onclick = () => selMuni(n);
      d.innerHTML = `<div class="sb-nm">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</div><div class="sb-mt">${totP} puestos</div>${s.coord ? `<div class="sb-cd">👤 ${esc(s.coord)}</div>` : ''}`;
      grp.appendChild(d);
    });
    list.appendChild(grp);
  });
}
function selMuni(n) { CUR = n; buildSB(); renderMuni(n); loadPuestoIds(n); loadAllTestigosForMuni(n); }
function goHome() {
  CUR = null; buildSB();
  document.getElementById('ct').innerHTML = `
    <div class="empty">
      <div class="empty-ico">🇨🇴</div>
      <h3 style="color:var(--t1);font-size:17px;margin-bottom:6px">Centro de Comando Antioquia</h3>
      <p style="font-size:12px">Selecciona un municipio para gestionar comunas, puestos, testigos y movilidad.</p>
      <div id="ov-wrap" style="margin-top:20px;padding:0 10px"></div>
    </div>`;
  renderOV();
}

// ═══ MUNI VIEW ═══
function renderMuni(n) {
  const comunas = RAW[n]; const s = gs(n); const ckeys = Object.keys(comunas).sort();
  let totP = 0, totM = 0, totV = 0;
  let totTestReg = 0, totTestFalt = 0, totCov = 0;
  ckeys.forEach(c => {
    comunas[c].forEach(p => { totP++; totM += (p.mesas || 0); totV += (p.total || 0); });
    const st = _ccStats(n, c);
    totTestReg += st.testReg; totTestFalt += st.testFalt;
  });
  const pctCov = totM ? Math.round(totTestReg / totM * 100) : 0;
  const isMed = (n === 'MEDELLIN'); const label = isMed ? 'MEDELLÍN' : n;
  document.getElementById('ct').innerHTML = `
    <div class="mh">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <button class="back-btn" data-action="go-home" title="Volver al inicio">← Inicio</button>
        <div><div class="mh-t">${label}</div><div class="mh-s">${totP} puestos · ${ckeys.length} zonas · ${totV.toLocaleString('es-CO')} votantes</div></div>
      </div>
      <div class="mh-coord">
        <div><div class="cl">Coordinador ${isMed ? 'ciudad' : 'municipal'}</div><div class="cv" id="mh-cv">${esc(s.coord) || '—'}</div><span id="mh-phone-wa">${s.phone ? `<div class="cp">${esc(s.phone)}<a class="wa-btn" href="https://wa.me/57${s.phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a></div>` : ''}</span></div>
        <button class="ebtn" onclick="editMuni('${n}')">✎ Editar</button>
      </div>
    </div>
    <div class="stats">
      <div class="sc"><div class="sl">Puestos</div><div class="sv">${totP}</div></div>
      <div class="sc"><div class="sl">Mesas</div><div class="sv">${totM.toLocaleString('es-CO')}</div></div>
      <div class="sc"><div class="sl">Zonas/Comunas</div><div class="sv">${ckeys.length}</div></div>
      <div class="sc"><div class="sl">Votantes</div><div class="sv">${(totV / 1000).toFixed(0)}K</div></div>
      <div class="sc"><div class="sl">Testigos</div><div class="sv" id="mh-test-reg">${totTestReg}</div></div>
      <div class="sc${totTestFalt > 0 ? ' sc-warn' : ''}" id="mh-test-falt"><div class="sl">Mesas sin testigo</div><div class="sv">${totTestFalt}</div></div>
      <div class="sc"><div class="sl">% Cobertura</div><div class="sv">${pctCov}%</div></div>
    </div>
    <div class="otabs">
      <div class="otab on" onclick="switchOTab(this,'ot-comunas')">Por Zonas/Comunas</div>
      <div class="otab" onclick="switchOTab(this,'ot-todos')">Todos los puestos</div>
      <div class="otab" onclick="switchOTab(this,'ot-mapa')">🗺 Mapa</div>
    </div>
    <div id="ot-comunas" class="opane on"><div class="body" id="cc-body"></div></div>
    <div id="ot-todos" class="opane"><div class="body" id="at-body"></div></div>
    <div id="ot-mapa" class="opane"><div id="ot-mapa-inner" style="height:520px"></div></div>`;
  renderCCs(n);
}
function switchOTab(el, id) {
  document.querySelectorAll('.otab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.opane').forEach(p => p.classList.remove('on'));
  el.classList.add('on'); document.getElementById(id).classList.add('on');
  if (id === 'ot-todos') renderAllPuestos(CUR);
  if (id === 'ot-mapa') renderMuniMap(CUR);
}

// ═══ STATS HELPER PER COMMUNE ═══
function _ccStats(n, ck) {
  const s = gs(n);
  const puestos = RAW[n][ck] || [];
  const totPuestos = puestos.length;
  const totMesas = puestos.reduce((a, p) => a + (p.mesas || 0), 0);
  let testReg = 0, testPuCub = 0;
  puestos.forEach(p => {
    const rows = (s.testigos?.[ck]?.[p.puesto] || []).filter(r => r.nombre);
    testReg += rows.length;
    if (rows.length > 0) testPuCub++;
  });
  const testFalt = Math.max(0, totMesas - testReg);
  const covPuestos = puestos.filter(p => (s.puestos[pk(p)] || {}).coord).length;
  const pct = totMesas ? Math.round(testReg / totMesas * 100) : 0;
  const resps = (s.movilidad?.[ck]?.responsables) || [];
  const totMotos = resps.reduce((a, r) => a + (parseInt(r.motos) || 0), 0);
  const totCarros = resps.reduce((a, r) => a + (parseInt(r.carros) || 0), 0);
  return { totPuestos, totMesas, testReg, testFalt, testPuCub, covPuestos, pct, totMotos, totCarros };
}

function _refreshCCStats(n, ck) {
  const id = cid(n, ck);
  if (!document.getElementById(id)) return;
  const { testReg, testFalt } = _ccStats(n, ck);
  const tEl = document.getElementById(id + '-s-t');
  const tfEl = document.getElementById(id + '-s-tf');
  if (tEl) tEl.textContent = testReg;
  if (tfEl) {
    tfEl.querySelector('.v').textContent = testFalt;
    tfEl.classList.toggle('cc-st-warn', testFalt > 0);
  }
  if (n === 'MEDELLIN') {
    const zona = (typeof MEDELLIN_ZONAS !== 'undefined' ? MEDELLIN_ZONAS : []).find(z => z.comunas.includes(ck));
    if (zona) _refreshZonaStats(n, zona.nombre);
  }
  _refreshMuniStats(n);
}

function _refreshZonaStats(n, zonaNombre) {
  const zid = 'z_' + btoa(unescape(encodeURIComponent(zonaNombre))).replace(/[^a-z0-9]/gi, '');
  const zona = (typeof MEDELLIN_ZONAS !== 'undefined' ? MEDELLIN_ZONAS : []).find(z => z.nombre === zonaNombre);
  if (!zona) return;
  let totTestReg = 0, totTestFalt = 0;
  zona.comunas.forEach(ck => {
    if (!RAW[n][ck]) return;
    const st = _ccStats(n, ck);
    totTestReg += st.testReg;
    totTestFalt += st.testFalt;
  });
  const tEl = document.getElementById(zid + '-s-t');
  const tfEl = document.getElementById(zid + '-s-tf');
  if (tEl) tEl.textContent = totTestReg;
  if (tfEl) {
    tfEl.querySelector('.v').textContent = totTestFalt;
    tfEl.classList.toggle('cc-st-warn', totTestFalt > 0);
  }
}

function _refreshMuniStats(n) {
  const tEl = document.getElementById('mh-test-reg');
  const tfEl = document.getElementById('mh-test-falt');
  if (!tEl || !tfEl) return;
  let totTestReg = 0, totTestFalt = 0;
  Object.keys(RAW[n] || {}).forEach(ck => {
    const st = _ccStats(n, ck);
    totTestReg += st.testReg;
    totTestFalt += st.testFalt;
  });
  tEl.textContent = totTestReg;
  tfEl.querySelector('.sv').textContent = totTestFalt;
  tfEl.classList.toggle('sc-warn', totTestFalt > 0);
}

async function loadAllTestigosForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const comunas = Object.keys(RAW[n] || {});
  await Promise.all(comunas.map(ck => loadTestigosForComune(n, ck)));
  _refreshMuniStats(n);
}

// ═══ ZONA CARDS ═══
function buildZonaCard(n, zona) {
  const s = gs(n); const sz = (s.zonas || {})[zona.nombre] || {};
  let totPuestos = 0, totMesas = 0;
  let totTestReg = 0, totTestFalt = 0, totMotos = 0, totCarros = 0, totCov = 0;
  zona.comunas.forEach(ck => {
    if (!RAW[n][ck]) return;
    const st = _ccStats(n, ck);
    totPuestos += st.totPuestos; totMesas += st.totMesas;
    totTestReg += st.testReg; totTestFalt += st.testFalt;
    totMotos += st.totMotos; totCarros += st.totCarros;
  });
  const pct = totMesas ? Math.round(totTestReg / totMesas * 100) : 0;
  const zid = 'z_' + btoa(unescape(encodeURIComponent(zona.nombre))).replace(/[^a-z0-9]/gi, '');
  const isOpen = OPEN_Z.has(n + zona.nombre);
  const el = document.createElement('div'); el.className = 'zona-card'; el.id = zid;
  el.innerHTML = `
    <div class="zona-card-hd" onclick="toggleZ('${n}','${zona.nombre.replace(/'/g, "\\'")}')">
      <div class="zona-card-left">
        <div class="zona-card-nm">${zona.nombre}</div>
        <div class="zona-card-coord">
          <span>Coord:</span><span id="${zid}-cv">${esc(sz.coord) || '—'}</span>
          <span id="${zid}-phone-wa">${sz.phone ? `<span>· ${esc(sz.phone)}</span><a class="wa-btn" href="https://wa.me/57${sz.phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>` : ''}</span>
          <button class="zona-ced" onclick="event.stopPropagation();editZona('${n}','${zona.nombre.replace(/'/g, "\\'")}')">✎</button>
        </div>
      </div>
      <div class="chev${isOpen ? ' op' : ''}">▾</div>
    </div>
    <div class="cc-stats-bar">
      <div class="cc-st"><div class="v">${totPuestos}</div><div class="l">Puestos</div></div>
      <div class="cc-st"><div class="v">${totMesas.toLocaleString('es-CO')}</div><div class="l">Mesas</div></div>
      <div class="cc-st"><div class="v" id="${zid}-s-t">${totTestReg}</div><div class="l">Testigos</div></div>
      <div class="cc-st${totTestFalt > 0 ? ' cc-st-warn' : ''}" id="${zid}-s-tf"><div class="v">${totTestFalt}</div><div class="l">Mesas sin testigo</div></div>
      <div class="cc-st"><div class="v">${pct}%</div><div class="l">Cobertura</div></div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${pct}%"></div></div>
    <div class="zona-card-bd${isOpen ? ' op' : ''}" id="${zid}-bd"></div>`;
  const bd = el.querySelector('#' + zid + '-bd');
  zona.comunas.forEach(ck => { if (RAW[n][ck]) bd.appendChild(buildCCCard(n, ck)); });
  return el;
}

// ═══ COMMUNE CARDS ═══
function buildCCCard(n, ck) {
  const puestos = RAW[n][ck]; const s = gs(n); const sc = (s.comunas || {})[ck] || {};
  const totV = puestos.reduce((a, p) => a + (p.total || 0), 0);
  const id = cid(n, ck); const isOpen = OPEN_CC.has(n + ck);
  const card = document.createElement('div'); card.className = 'cc'; card.id = id;
  const { totPuestos, totMesas, testReg, testFalt, pct } = _ccStats(n, ck);
  card.innerHTML = `
    <div class="cc-hd" onclick="toggleCC('${n}','${ck.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}')">
      <div>
        <div class="cc-nm">${ck}</div>
        <div class="cc-crd-row">
          <span class="cc-crd-lbl">Coord:</span>
          <span class="cc-crd-val" id="${id}-cv">${esc(sc.coord) || '—'}</span>
          <span id="${id}-phone-wa">${sc.phone ? `<span class="cc-crd-ph">· ${esc(sc.phone)}</span><a class="wa-btn" href="https://wa.me/57${sc.phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>` : ''}</span>
          <button class="cc-ced" onclick="event.stopPropagation();editCC('${n}','${ck.replace(/'/g, "\\'")}')">✎</button>
        </div>
      </div>
      <div class="chev${isOpen ? ' op' : ''}">▾</div>
    </div>
    <div class="cc-stats-bar">
      <div class="cc-st"><div class="v">${totPuestos}</div><div class="l">Puestos</div></div>
      <div class="cc-st"><div class="v">${totMesas.toLocaleString('es-CO')}</div><div class="l">Mesas</div></div>
      <div class="cc-st"><div class="v" id="${id}-s-t">${testReg}</div><div class="l">Testigos</div></div>
      <div class="cc-st${testFalt > 0 ? ' cc-st-warn' : ''}" id="${id}-s-tf"><div class="v">${testFalt}</div><div class="l">Mesas sin testigo</div></div>
      <div class="cc-st"><div class="v">${pct}%</div><div class="l">Cobertura</div></div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${pct}%"></div></div>
    <div class="cc-bd${isOpen ? ' op' : ''}" id="${id}-bd">
      <div class="itabs">
        <div class="itab on" data-pane="${id}-puestos" onclick="switchIT(this,'${id}-puestos')">📋 Puestos (${puestos.length})</div>
        <div class="itab" data-pane="${id}-preg" onclick="switchIT(this,'${id}-preg');renderTestigosPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🧾 Testigos</div>
        <div class="itab" data-pane="${id}-mov" onclick="switchIT(this,'${id}-mov');renderMovPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🚗 Movilidad</div>
        <div class="itab" data-pane="${id}-abog" onclick="switchIT(this,'${id}-abog');renderAbogadoPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">⚖️ Abogado</div>
        <div class="itab" data-pane="${id}-refrig" onclick="switchIT(this,'${id}-refrig');renderRefrigPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🍱 Refrigerios</div>
        <div class="itab" data-pane="${id}-comp" onclick="switchIT(this,'${id}-comp');renderComparendosPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">⚠️ Comparendos</div>
        <div class="itab" data-pane="${id}-mapa" onclick="switchIT(this,'${id}-mapa');renderMapPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🗺 Mapa</div>
      </div>
      <div class="ipane on" id="${id}-puestos"><div style="padding:8px">${buildPT(n, puestos, ck)}</div></div>
      <div class="ipane" id="${id}-preg"></div>
      <div class="ipane" id="${id}-mov"></div>
      <div class="ipane" id="${id}-abog"></div>
      <div class="ipane" id="${id}-refrig"></div>
      <div class="ipane" id="${id}-comp"></div>
      <div class="ipane" id="${id}-mapa"></div>
    </div>`;
  return card;
}
function _restoreTabForCC(n, ck) {
  const id = cid(n, ck);
  const savedPane = OPEN_ITABS[id];
  if (!savedPane || !OPEN_CC.has(n + ck)) return;
  const bd = document.getElementById(id + '-bd');
  if (!bd) return;
  bd.querySelectorAll('.itab').forEach(t => t.classList.toggle('on', t.dataset.pane === savedPane));
  bd.querySelectorAll('.ipane').forEach(p => p.classList.toggle('on', p.id === savedPane));
  const suffix = savedPane.replace(id + '-', '');
  const renders = { preg: () => renderTestigosPanel(n, ck, id), mov: () => renderMovPanel(n, ck, id), abog: () => renderAbogadoPanel(n, ck, id), refrig: () => renderRefrigPanel(n, ck, id), comp: () => renderComparendosPanel(n, ck, id), mapa: () => renderMapPanel(n, ck, id) };
  if (renders[suffix]) renders[suffix]();
}
function renderCCs(n) {
  const body = document.getElementById('cc-body'); body.innerHTML = '';
  if (n === 'MEDELLIN') {
    MEDELLIN_ZONAS.forEach(zona => {
      body.appendChild(buildZonaCard(n, zona));
      zona.comunas.forEach(ck => { if (RAW[n][ck]) _restoreTabForCC(n, ck); });
    });
  } else {
    Object.keys(RAW[n]).sort().forEach(ck => {
      body.appendChild(buildCCCard(n, ck));
      _restoreTabForCC(n, ck);
    });
  }
}
function switchIT(el, paneid) {
  const bd = el.closest('.cc-bd');
  const cardId = bd.id.replace('-bd', '');
  OPEN_ITABS[cardId] = paneid;
  bd.querySelectorAll('.itab').forEach(t => t.classList.remove('on'));
  bd.querySelectorAll('.ipane').forEach(p => p.classList.remove('on'));
  el.classList.add('on'); document.getElementById(paneid).classList.add('on');
}
function toggleCC(n, ck) {
  const key = n + ck; const id = cid(n, ck);
  const bd = document.getElementById(id + '-bd'); const chev = document.querySelector('#' + id + ' .chev');
  if (!bd) return;
  if (OPEN_CC.has(key)) { OPEN_CC.delete(key); bd.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_CC.add(key); bd.classList.add('op'); if (chev) chev.classList.add('op'); }
}
function toggleZ(n, zonaNombre) {
  const key = n + zonaNombre;
  const zid = 'z_' + btoa(unescape(encodeURIComponent(zonaNombre))).replace(/[^a-z0-9]/gi, '');
  const bd = document.getElementById(zid + '-bd'); const chev = document.querySelector('#' + zid + ' .chev');
  if (!bd) return;
  if (OPEN_Z.has(key)) { OPEN_Z.delete(key); bd.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_Z.add(key); bd.classList.add('op'); if (chev) chev.classList.add('op'); }
}

// ═══ PUESTOS ═══
function buildPT(n, puestos, ckKey) {
  const s = gs(n);
  return puestos.map(p => {
    const k = pk(p); const ps = (s.puestos || {})[k] || {};
    const t = ps.tag || 'n'; const tg = TAGS[t] || TAGS.n;
    const map = p.lat && p.lon ? `<a class="map-a" href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank">Ver mapa</a>` : '';
    const testReg = ((s.testigos?.[ckKey]?.[p.puesto]) || []).filter(r => r.nombre).length;
    const divipole = `${String(p.dd).padStart(2, '0')}.${String(p.mm).padStart(3, '0')}.${String(p.zz).padStart(2, '0')}.${String(p.pp).padStart(2, '0')}`;
    const pcid = 'pc_' + k + '_' + btoa(unescape(encodeURIComponent(ckKey))).replace(/[^a-z0-9]/gi, '');
    const coordPill = ps.coord
      ? `<span class="pc-pill coord" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')">👤 ${esc(ps.coord)}${ps.phone ? ' · ' + esc(ps.phone) : ''}</span>${ps.phone ? `<a class="wa-btn" href="https://wa.me/57${ps.phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>` : ''}`
      : `<span class="pc-pill nocoord" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')">+ Coord. puesto</span>`;
    return `<div class="pc" id="${pcid}">
      <div class="pc-hd" onclick="togglePC('${pcid}')">
        <div class="pc-left">
          <div class="pc-nm">${p.puesto}</div>
          <div class="pc-dir">${p.direccion}</div>
          <div class="pc-pills">
            <span class="pc-pill">${p.mesas || 0} mesas</span>
            <span class="pc-pill">${(p.total || 0).toLocaleString('es-CO')} v.</span>
            <button class="${tg.cls} tbtn" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}');">${tg.lbl}</button>
            ${coordPill}
            ${testReg > 0 ? `<span class="pc-pill" style="color:var(--green);border-color:rgba(46,216,122,.3)">Test. ${testReg}</span>` : ''}
            ${map}
          </div>
        </div>
        <div class="pc-right">
          <button class="pc-edit-btn" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')" title="Editar coordinador">✎</button>
          <div class="pc-chev" id="${pcid}-chev">▾</div>
        </div>
      </div>
      <div class="pc-body" id="${pcid}-body">
        <div class="pc-section">
          <div class="pc-section-title">Coordinador del puesto</div>
          <div class="pc-coord-row">
            <input class="pc-inp" type="text" placeholder="Nombre coordinador" value="${esc(ps.coord)}" id="${pcid}-coord">
            <input class="pc-inp" type="text" placeholder="Teléfono" value="${esc(ps.phone)}" id="${pcid}-phone" style="max-width:150px">
            <select class="pc-inp" id="${pcid}-tag" style="max-width:130px">
              <option value="n" ${t === 'n' ? 'selected' : ''}>Sin estado</option>
              <option value="ok" ${t === 'ok' ? 'selected' : ''}>✓ Cubierto</option>
              <option value="pr" ${t === 'pr' ? 'selected' : ''}>★ Prioritario</option>
              <option value="pe" ${t === 'pe' ? 'selected' : ''}>⏳ Pendiente</option>
              <option value="al" ${t === 'al' ? 'selected' : ''}>⚠ Alerta</option>
            </select>
            <button class="pc-save" onclick="savePCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}','${pcid}')">💾 Guardar</button>
          </div>
        </div>
        <div class="pc-info-row">
          <span>DIVIPOLE: <b>${divipole}</b></span>
          <span>Mesas: <b>${p.mesas || 0}</b></span>
          <span>Votantes: <b>${(p.total || 0).toLocaleString('es-CO')}</b></span>
        </div>
        ${ps.notes ? `<div style="font-size:11px;color:var(--t2);background:var(--bg);border-radius:5px;padding:6px 9px;margin-bottom:8px">📝 ${esc(ps.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

let OPEN_PP = new Set();
function togglePP(id) {
  const body = document.getElementById(id); const chev = document.getElementById(id + '-chev');
  if (!body) return;
  if (OPEN_PP.has(id)) { OPEN_PP.delete(id); body.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_PP.add(id); body.classList.add('op'); if (chev) chev.classList.add('op'); }
}
let OPEN_PC = new Set();
function togglePC(id) {
  const body = document.getElementById(id + '-body'); const chev = document.getElementById(id + '-chev');
  if (!body) return;
  if (OPEN_PC.has(id)) { OPEN_PC.delete(id); body.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_PC.add(id); body.classList.add('op'); if (chev) chev.classList.add('op'); }
}

async function savePCard(n, k, ck, pcid) {
  const s = gs(n); if (!s.puestos) s.puestos = {};
  const coord = document.getElementById(pcid + '-coord').value.trim();
  const phone = document.getElementById(pcid + '-phone').value.trim();
  const tag = document.getElementById(pcid + '-tag').value;
  s.puestos[k] = { ...((s.puestos[k]) || {}), coord, phone, tag };
  saveLocalSt();
  await writeMuni(n);
  const tg = TAGS[tag] || TAGS.n;
  const tagBtn = document.querySelector(`#${pcid} .tbtn`);
  if (tagBtn) { tagBtn.className = tg.cls + ' tbtn'; tagBtn.textContent = tg.lbl; }
  const coordPills = document.querySelectorAll(`#${pcid} .pc-pill.coord, #${pcid} .pc-pill.nocoord`);
  coordPills.forEach(el => {
    el.className = coord ? 'pc-pill coord' : 'pc-pill nocoord';
    el.textContent = coord ? '👤 ' + coord + (phone ? ' · ' + phone : '') : '+ Coord. puesto';
  });
  const btn = document.querySelector(`#${pcid} .pc-save`);
  if (btn) { const orig = btn.textContent; btn.textContent = '✓ Guardado'; btn.style.background = 'var(--green)'; setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1800); }
  renderCCs(n);
}

function editPCard(n, k, ck) {
  const pcid = 'pc_' + k + '_' + btoa(unescape(encodeURIComponent(ck))).replace(/[^a-z0-9]/gi, '');
  if (!OPEN_PC.has(pcid)) togglePC(pcid);
  setTimeout(() => { const el = document.getElementById(pcid + '-coord'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 100);
}
function buildAllPuestosSection(n, ck, puestos, s) {
  const sc = (s.comunas || {})[ck] || {};
  return `<div style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;border-bottom:1px solid var(--b1)">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--t3);flex:1">${ck}</div>
      ${sc.coord ? `<span style="font-size:10px;color:var(--blue)">👤 ${esc(sc.coord)}${sc.phone ? ' · ' + esc(sc.phone) : ''}</span>` : `<span style="font-size:10px;color:var(--t3);font-style:italic">Sin coordinador de zona</span>`}
      <button onclick="editCC('${n}','${ck.replace(/'/g, "\\'")}')" style="background:none;border:1px solid var(--b2);color:var(--t2);cursor:pointer;padding:2px 7px;font-size:11px;border-radius:4px;line-height:1.4" title="Editar coordinador de zona">✎</button>
    </div>
    ${buildPT(n, puestos, ck)}
  </div>`;
}
function renderAllPuestos(n) {
  const body = document.getElementById('at-body'); let html = '';
  const s = gs(n);
  if (n === 'MEDELLIN') {
    MEDELLIN_ZONAS.forEach(zona => {
      const sz = (s.zonas || {})[zona.nombre] || {};
      html += `<div class="zona-hdr">
        <span style="flex:1">${zona.nombre}</span>
        ${sz.coord ? `<span style="text-transform:none;letter-spacing:0;font-size:10px;color:var(--blue);font-weight:600">👤 ${esc(sz.coord)}${sz.phone ? ' · ' + esc(sz.phone) : ''}</span>` : ''}
        <button class="zona-ced" onclick="editZona('${n}','${zona.nombre.replace(/'/g, "\\'")}')">✎</button>
      </div>`;
      zona.comunas.forEach(ck => { if (RAW[n][ck]) html += buildAllPuestosSection(n, ck, RAW[n][ck], s); });
    });
  } else {
    Object.entries(RAW[n]).sort(([a], [b]) => a.localeCompare(b)).forEach(([ck, puestos]) => {
      html += buildAllPuestosSection(n, ck, puestos, s);
    });
  }
  body.innerHTML = html;
}

// ═══ TESTIGOS ═══
// Load testigos from API for all puestos in a commune, merging into localStorage state.
async function loadTestigosForComune(n, ck) {
  if (!window.api || !window.CURRENT_USER) return;
  await loadPuestoIds(n); // idempotent no-op if already loaded
  const puestosList = RAW[n][ck] || [];
  const s = gs(n);
  if (!s.testigos) s.testigos = {};
  if (!s.testigos[ck]) s.testigos[ck] = {};
  for (const p of puestosList) {
    const puestoBackendId = getPuestoBackendId(n, p.puesto);
    if (!puestoBackendId) continue;
    try {
      const rows = await api.get(`/puestos/${puestoBackendId}/testigos`);
      s.testigos[ck][p.puesto] = rows.map(t => ({
        _backendId: t.id,
        nombre: t.name || '',
        telefono: t.phone || '',
        cedula: t.cedula || '',
        notas: t.notes || '',
      }));
    } catch (err) {
      console.error('loadTestigosForComune failed for', p.puesto, err?.status);
    }
  }
  saveLocalSt();
  _refreshCCStats(n, ck);
}

async function renderTestigosPanel(n, ck, id) {
  const pane = document.getElementById(id + '-preg');
  if (!pane) return;
  pane.innerHTML = '<div style="padding:12px;color:var(--t3);font-size:11px">⏳ Cargando testigos...</div>';
  await loadTestigosForComune(n, ck);
  const puestosList = RAW[n][ck] || [];
  const s = gs(n);
  let html = `<div class="preg-panel">`;
  puestosList.forEach(p => {
    const pName = p.puesto;
    const pKey = encodeURIComponent(pName);
    const ppid = `${id}-pp-${btoa(pKey).replace(/=/g, '')}`;
    const coordPuesto = (s.puestos || {})[pk(p)] || {};
    const testReg = getTestigos(n, ck, pName).filter(t => t.nombre).length;
    html += `<div class="puesto-preg">
      <div class="pp-hd" onclick="togglePP('${ppid}')">
        <span class="pp-nm" title="${pName}">${pName}</span>
        <div class="pp-right">
          <div class="pp-pills">
            <span class="pp-pill ${testReg > 0 ? 'ok' : ''}">🧾 ${testReg}</span>
          </div>
          <span class="pp-chev" id="${ppid}-chev">▾</span>
        </div>
      </div>
      <div class="pp-body" id="${ppid}">
        ${coordPuesto.coord ? `<div style="font-size:11px;color:var(--t2);background:var(--bg);border-radius:5px;padding:6px 9px;margin-bottom:8px;display:flex;align-items:center;gap:6px"><b>Coordinador:</b> 👤 ${esc(coordPuesto.coord)}${coordPuesto.phone ? ` · <span>${esc(coordPuesto.phone)}</span><a class="wa-btn" href="https://wa.me/57${coordPuesto.phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : ''}</div>` : ''}
        <div class="test-section">
          <h5>🧾 Testigos electorales <span style="color:var(--t3);font-weight:400">(${testReg})</span></h5>
          <div id="${id}-test-${btoa(pKey).replace(/=/g, '')}">${buildTestRows(n, ck, pName, id, pKey)}</div>
          <button class="add-btn" onclick="addTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}','${id}')">+ Agregar testigo</button>
        </div>
      </div>
    </div>`;
  });
  html += `</div>`;
  pane.innerHTML = html;
  puestosList.forEach(p => {
    const pKey2 = encodeURIComponent(p.puesto);
    const ppid = `${id}-pp-${btoa(pKey2).replace(/=/g, '')}`;
    if (OPEN_PP.has(ppid)) {
      const body2 = document.getElementById(ppid);
      const chev2 = document.getElementById(ppid + '-chev');
      if (body2) body2.classList.add('op');
      if (chev2) chev2.classList.add('op');
    }
  });
}

function getTestigos(n, ck, pName) { return (gs(n).testigos?.[ck]?.[pName]) || []; }

function buildTestRows(n, ck, pName, id, pKey) {
  const rows = getTestigos(n, ck, pName);
  if (!rows.length) return '<div style="font-size:10px;color:var(--t3);padding:2px 0">Sin testigos aún</div>';
  return rows.map((r, i) => `<div class="test-row">
    <input class="pi" style="flex:2" type="text" placeholder="Nombre" value="${esc(r.nombre)}"
      onchange="updateTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'nombre',this.value)">
    <input class="pi pi-sm" type="text" placeholder="Teléfono" value="${esc(r.telefono)}"
      onchange="updateTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'telefono',this.value)">
    ${r.telefono ? `<a class="wa-btn" href="https://wa.me/57${r.telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : '<span class="wa-btn-ph"></span>'}
    <button class="del-btn" onclick="delTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'${id}')">×</button>
  </div>`).join('');
}


function addTestigo(n, ck, pKey, id) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.testigos) s.testigos = {}; if (!s.testigos[ck]) s.testigos[ck] = {};
  if (!s.testigos[ck][pName]) s.testigos[ck][pName] = [];
  s.testigos[ck][pName].push({ nombre: '', telefono: '' }); saveLocalSt();
  writeMuni(n);
  // Real API call — fire and forget with error logging
  if (window.api && window.CURRENT_USER) {
    const testigos = s.testigos[ck][pName];
    const newT = testigos[testigos.length - 1];

    // Try to find puesto backend ID from cache
    const comunaPuestos = RAW[n] && RAW[n][ck] ? RAW[n][ck] : [];
    const puestoEntry = comunaPuestos.find ? comunaPuestos.find(p => p.puesto === pName) : null;
    const puestoRawName = puestoEntry ? puestoEntry.puesto : pName;
    const puestoBackendId = getPuestoBackendId(n, puestoRawName);

    if (puestoBackendId) {
      api.post(`/puestos/${puestoBackendId}/testigos`, {
        name: newT.nombre || '',
        phone: newT.telefono || undefined,
      }).then(created => {
        // Store backend ID on the testigo object for future update/delete
        newT._backendId = created.id;
        saveLocalSt();
      }).catch(err => _onWriteError('testigo create failed', err));
    }
  }
  const el = document.getElementById(`${id}-test-${btoa(pKey).replace(/=/g, '')}`);
  if (el) el.innerHTML = buildTestRows(n, ck, pName, id, pKey);
}

function updateTestigo(n, ck, pKey, idx, field, val) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.testigos) s.testigos = {}; if (!s.testigos[ck]) s.testigos[ck] = {};
  if (!s.testigos[ck][pName]) s.testigos[ck][pName] = [];
  if (!s.testigos[ck][pName][idx]) s.testigos[ck][pName][idx] = { nombre: '', telefono: '' };
  s.testigos[ck][pName][idx][field] = val; saveLocalSt();
  writeDebounced(n);
  // Best-effort PATCH
  const t = s.testigos[ck][pName]?.[idx];
  if (window.api && t?._backendId) {
    const fieldMap = { nombre: 'name', telefono: 'phone', notas: 'notes' };
    const backendField = fieldMap[field] || field;
    api.patch(`/testigos/${t._backendId}`, { [backendField]: val })
      .catch(err => _onWriteError('testigo update failed', err));
  }
}

function delTestigo(n, ck, pKey, idx, id) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  const deletedTestigo = s.testigos[ck][pName][idx]; // capture before splice
  s.testigos[ck][pName].splice(idx, 1); saveLocalSt();
  if (window.api && deletedTestigo?._backendId) {
    api.delete(`/testigos/${deletedTestigo._backendId}`)
      .catch(err => _onWriteError('testigo delete failed', err));
  }
  writeMuni(n);
  const el = document.getElementById(`${id}-test-${btoa(pKey).replace(/=/g, '')}`);
  if (el) el.innerHTML = buildTestRows(n, ck, pName, id, pKey);
}

// ═══ MOVILIDAD ═══
function renderMovPanel(n, ck, id) {
  const pane = document.getElementById(id + '-mov');
  const s = gs(n);
  if (!s.movilidad) s.movilidad = {};
  if (!s.movilidad[ck]) s.movilidad[ck] = { responsables: [], motos_nec: 0, carros_nec: 0 };
  const mov = s.movilidad[ck];
  if (!mov.responsables) {
    const oldMotos = mov.motos || []; const oldCarros = mov.carros || [];
    const maxLen = Math.max(oldMotos.length, oldCarros.length);
    mov.responsables = [];
    for (let i = 0; i < maxLen; i++) {
      const m = oldMotos[i] || {}; const c = oldCarros[i] || {};
      mov.responsables.push({ nombre: m.nombre || c.nombre || '', telefono: m.telefono || c.telefono || '', motos: m.nombre ? 1 : 0, carros: c.nombre ? 1 : 0 });
    }
    delete mov.motos; delete mov.carros;
  }
  const resps = mov.responsables;
  const totalMotosReg = resps.reduce((a, r) => a + (parseInt(r.motos) || 0), 0);
  const totalCarrosReg = resps.reduce((a, r) => a + (parseInt(r.carros) || 0), 0);
  const motosNec = mov.motos_nec || 0; const carrosNec = mov.carros_nec || 0;
  const respCards = resps.length
    ? resps.map((r, i) => `
      <div class="resp-card">
        <div class="resp-hd">
          <span class="resp-num">#${i + 1}</span>
          <input class="resp-name-inp" type="text" placeholder="Nombre" value="${esc(r.nombre)}"
            onchange="updateResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'nombre',this.value,'${id}')">
          <input class="resp-phone-inp" type="text" placeholder="Teléfono" value="${esc(r.telefono)}"
            onchange="updateResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'telefono',this.value,'${id}')">
          ${r.telefono ? `<a class="wa-btn" href="https://wa.me/57${r.telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : '<span class="wa-btn-ph"></span>'}
          <button class="del-btn" onclick="delResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'${id}')">×</button>
        </div>
        <div class="resp-body">
          <div class="resp-veh mo">
            <span class="resp-veh-icon">🏍</span><span class="resp-veh-lbl">Motos</span>
            <input class="resp-veh-inp" type="number" min="0" value="${r.motos || 0}"
              onchange="updateResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'motos',this.value,'${id}')">
          </div>
          <div class="resp-veh ca">
            <span class="resp-veh-icon">🚗</span><span class="resp-veh-lbl">Carros</span>
            <input class="resp-veh-inp" type="number" min="0" value="${r.carros || 0}"
              onchange="updateResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'carros',this.value,'${id}')">
          </div>
        </div></div>`).join('')
    : '<div style="font-size:11px;color:var(--t3);padding:6px 0;text-align:center">Sin responsables aún</div>';
  pane.innerHTML = `<div class="mov-panel">
    <div class="mov-totals-row">
      <div class="mov-total mo">
        <span class="lbl">🏍 Registradas:</span>
        <span class="tot-val" id="${id}-tot-mo">${totalMotosReg}</span>
        <span class="sep">/ necesarias:</span>
        <input class="nec-inp" type="number" min="0" value="${motosNec}"
          onchange="saveMovNec('${n}','${ck.replace(/'/g, "\\'")}','motos_nec',this.value)">
      </div>
      <div class="mov-total ca">
        <span class="lbl">🚗 Registrados:</span>
        <span class="tot-val" id="${id}-tot-ca">${totalCarrosReg}</span>
        <span class="sep">/ necesarios:</span>
        <input class="nec-inp" type="number" min="0" value="${carrosNec}"
          onchange="saveMovNec('${n}','${ck.replace(/'/g, "\\'")}','carros_nec',this.value)">
      </div>
    </div>
    <div class="resp-list" id="${id}-resp-list">${respCards}</div>
    <button class="resp-add-btn" onclick="addResp('${n}','${ck.replace(/'/g, "\\'")}','${id}')">+ Agregar responsable</button>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="mv-save-all" onclick="saveMovAll('${n}','${ck.replace(/'/g, "\\'")}','${id}')">💾 Guardar movilidad</button>
      <span class="mv-ok" id="${id}-mov-ok">✓ Guardado</span>
    </div>
  </div>`;
}

function updateResp(n, ck, idx, field, val, id) {
  const s = gs(n);
  if (!s.movilidad[ck].responsables[idx]) return;
  s.movilidad[ck].responsables[idx][field] = field === 'motos' || field === 'carros' ? parseInt(val) || 0 : val;
  saveLocalSt();
  writeDebounced(n, 700);
  const resps = s.movilidad[ck].responsables;
  const mo = resps.reduce((a, r) => a + (parseInt(r.motos) || 0), 0);
  const ca = resps.reduce((a, r) => a + (parseInt(r.carros) || 0), 0);
  const moEl = document.getElementById(id + '-tot-mo'); if (moEl) moEl.textContent = mo;
  const caEl = document.getElementById(id + '-tot-ca'); if (caEl) caEl.textContent = ca;
}
async function addResp(n, ck, id) {
  const s = gs(n);
  if (!s.movilidad[ck].responsables) s.movilidad[ck].responsables = [];
  s.movilidad[ck].responsables.push({ nombre: '', telefono: '', motos: 0, carros: 0 });
  saveLocalSt();
  await writeMuni(n);
  renderMovPanel(n, ck, id);
}
async function delResp(n, ck, idx, id) {
  const s = gs(n); s.movilidad[ck].responsables.splice(idx, 1);
  saveLocalSt();
  await writeMuni(n);
  renderMovPanel(n, ck, id);
}
function saveMovNec(n, ck, field, val) {
  const s = gs(n); if (!s.movilidad) s.movilidad = {}; if (!s.movilidad[ck]) s.movilidad[ck] = { responsables: [], motos_nec: 0, carros_nec: 0 };
  s.movilidad[ck][field] = parseInt(val) || 0; saveLocalSt();
  writeDebounced(n, 500);
}
async function saveMovAll(n, ck, id) {
  const s = gs(n);
  saveLocalSt();
  await writeMuni(n);
  renderCCs(n);
  const ok = document.getElementById(id + '-mov-ok');
  if (ok) { ok.classList.add('show'); setTimeout(() => ok.classList.remove('show'), 2000); }
}

// ═══ MODAL ═══
let MCX = null, SEL_T = 'n';
function openM(title, sub, ctx, opts = {}) {
  MCX = ctx; SEL_T = opts.tag || 'n';
  document.getElementById('mo-t').textContent = title; document.getElementById('mo-s').textContent = sub;
  document.getElementById('mi-c').value = opts.coord || ''; document.getElementById('mi-p').value = opts.phone || '';
  document.getElementById('mf-tag').style.display = opts.showTag ? '' : 'none';
  document.getElementById('mf-notes').style.display = opts.showNotes ? '' : 'none';
  if (opts.showNotes) document.getElementById('mi-n').value = opts.notes || '';
  document.querySelectorAll('.topt').forEach(t => t.classList.toggle('sel', t.dataset.t === SEL_T));
  document.getElementById('modal').style.display = 'flex';
  setTimeout(() => document.getElementById('mi-c').focus(), 50);
}
function closeM() { document.getElementById('modal').style.display = 'none'; MCX = null; }
function selT(el) { SEL_T = el.dataset.t; document.querySelectorAll('.topt').forEach(t => t.classList.remove('sel')); el.classList.add('sel'); }
async function saveM() {
  if (!MCX) return;
  const coord = document.getElementById('mi-c').value.trim();
  const phone = document.getElementById('mi-p').value.trim();
  const notes = document.getElementById('mi-n')?.value.trim() || '';
  const s = gs(MCX.n);
  if (MCX.type === 'muni') {
    s.coord = coord; s.phone = phone;
    saveLocalSt();
    await writeMuni(MCX.n);
  } else if (MCX.type === 'cc') {
    if (!s.comunas) s.comunas = {}; s.comunas[MCX.ck] = { coord, phone };
    saveLocalSt();
    await writeMuni(MCX.n);
  } else if (MCX.type === 'p') {
    if (!s.puestos) s.puestos = {}; s.puestos[MCX.k] = { coord, phone, tag: SEL_T, notes };
    saveLocalSt();
    await writeMuni(MCX.n);
  } else if (MCX.type === 'zona') {
    if (!s.zonas) s.zonas = {};
    s.zonas[MCX.zonaNombre] = { coord, phone };
    saveLocalSt();
    await writeMuni(MCX.n);
  }
  const _waHtml = (phone, extra) => phone
    ? `<span${extra ? ` class="${extra}"` : ''}>· ${esc(phone)}</span><a class="wa-btn" href="https://wa.me/57${phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>`
    : '';
  if (MCX.type === 'muni') {
    const el = document.getElementById('mh-cv'); if (el) el.textContent = coord || '—';
    const pw = document.getElementById('mh-phone-wa');
    if (pw) pw.innerHTML = phone ? `<div class="cp">${esc(phone)}<a class="wa-btn" href="https://wa.me/57${phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a></div>` : '';
    buildSB();
  } else if (MCX.type === 'cc') {
    const id = cid(MCX.n, MCX.ck);
    const el = document.getElementById(id + '-cv'); if (el) el.textContent = coord || '—';
    const pw = document.getElementById(id + '-phone-wa'); if (pw) pw.innerHTML = _waHtml(phone, 'cc-crd-ph');
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
  } else if (MCX.type === 'p') {
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
    else renderCCs(MCX.n);
  } else if (MCX.type === 'zona') {
    const zid = 'z_' + btoa(unescape(encodeURIComponent(MCX.zonaNombre))).replace(/[^a-z0-9]/gi, '');
    const el = document.getElementById(zid + '-cv'); if (el) el.textContent = coord || '—';
    const pw = document.getElementById(zid + '-phone-wa'); if (pw) pw.innerHTML = _waHtml(phone, '');
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
  }
  closeM();
}
function editMuni(n) { const s = gs(n); openM(`Coordinador — ${n === 'MEDELLIN' ? 'MEDELLÍN' : n}`, 'Coordinador principal', { type: 'muni', n }, { coord: s.coord, phone: s.phone }); }
function editCC(n, ck) { const s = gs(n); const sc = (s.comunas || {})[ck] || {}; openM('Coordinador de zona', ck, { type: 'cc', n, ck }, { coord: sc.coord, phone: sc.phone }); }
function editZona(n, zonaNombre) { const s = gs(n); const sz = (s.zonas || {})[zonaNombre] || {}; openM('Coordinador de zona geográfica', zonaNombre, { type: 'zona', n, zonaNombre }, { coord: sz.coord, phone: sz.phone }); }
function editP(n, k, ck) { if (ck !== undefined) { editPCard(n, k, ck); return; } const s = gs(n); const ps = (s.puestos || {})[k] || {}; openM('Puesto de votación', k.replace(/_/g, ' '), { type: 'p', n, k }, { coord: ps.coord, phone: ps.phone, tag: ps.tag || 'n', notes: ps.notes, showTag: true, showNotes: true }); }

// ═══ OVERVIEW ═══
function renderOV() {
  const wrap = document.getElementById('ov-wrap'); if (!wrap) return;
  let html = '';
  Object.entries(REGIONES).forEach(([region, munis]) => {
    const validMusis = munis.filter(n => RAW[n]);
    if (!validMusis.length) return;
    const rTotP = validMusis.reduce((a, n) => a + Object.values(RAW[n]).reduce((b, c) => b + c.length, 0), 0);
    const rTotM = validMusis.reduce((a, n) => a + Object.values(RAW[n]).reduce((b, c) => b + c.reduce((d, p) => d + (p.mesas || 0), 0), 0), 0);
    const rTotV = validMusis.reduce((a, n) => a + Object.values(RAW[n]).reduce((b, c) => b + c.reduce((d, p) => d + (p.total || 0), 0), 0), 0);
    const rTotZ = validMusis.reduce((a, n) => a + Object.keys(RAW[n]).length, 0);
    let rTestReg = 0, rTestFalt = 0;
    validMusis.forEach(n => Object.keys(RAW[n]).forEach(c => {
      const st = _ccStats(n, c);
      rTestReg += st.testReg; rTestFalt += st.testFalt;
    }));
    const rPct = rTotM ? Math.round(rTestReg / rTotM * 100) : 0;
    html += `
    <div style="margin-top:22px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:var(--fg)">${region} <span style="font-size:11px;font-weight:400;color:var(--t2)">· ${validMusis.length} municipios</span></div>
        <button class="export-btn" style="font-size:11px;padding:5px 12px" onclick="openRegionMap('${region}')">🗺 Mapa</button>
      </div>
      <div class="stats" style="margin-bottom:10px">
        <div class="sc"><div class="sl">Puestos</div><div class="sv">${rTotP}</div></div>
        <div class="sc"><div class="sl">Mesas</div><div class="sv">${rTotM.toLocaleString('es-CO')}</div></div>
        <div class="sc"><div class="sl">Zonas/Comunas</div><div class="sv">${rTotZ}</div></div>
        <div class="sc"><div class="sl">Votantes</div><div class="sv">${(rTotV / 1000).toFixed(0)}K</div></div>
        <div class="sc"><div class="sl">Testigos</div><div class="sv">${rTestReg}</div></div>
        <div class="sc${rTestFalt > 0 ? ' sc-warn' : ''}"><div class="sl">Mesas sin testigo</div><div class="sv">${rTestFalt}</div></div>
        <div class="sc"><div class="sl">% Cobertura</div><div class="sv">${rPct}%</div></div>
      </div>
    </div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px;margin-bottom:8px">`;
    validMusis.forEach(n => {
      const s = gs(n);
      const ckeys = Object.keys(RAW[n]);
      const totP = ckeys.reduce((a, c) => a + RAW[n][c].length, 0);
      const totM = ckeys.reduce((a, c) => a + RAW[n][c].reduce((b, p) => b + (p.mesas || 0), 0), 0);
      let testReg = 0, testFalt = 0;
      ckeys.forEach(c => {
        const st = _ccStats(n, c);
        testReg += st.testReg; testFalt += st.testFalt;
      });
      const pct = totM ? Math.round(testReg / totM * 100) : 0;
      html += `<div class="ov-muni-card" onclick="selMuni('${n}')">
        <div class="ov-muni-nm">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</div>
        <div class="ov-muni-sub">${ckeys.length} zonas · ${totP} puestos · ${totM.toLocaleString('es-CO')} mesas</div>
        ${s.coord ? `<div class="ov-muni-coord">👤 ${esc(s.coord)}</div>` : `<div class="ov-muni-coord" style="font-style:italic;color:var(--t3)">Sin coordinador</div>`}
        <div class="ov-muni-stats">
          <span class="ov-stat"><b>${testReg}</b><span>test.</span></span>
          <span class="ov-stat${testFalt > 0 ? ' warn' : ''}"><b>${testFalt}</b><span>m.s.test.</span></span>
          <span class="ov-stat"><b>${pct}%</b><span>cob.</span></span>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  wrap.innerHTML = html;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeM();
  if (e.key === 'Enter' && document.getElementById('modal').style.display !== 'none' && document.activeElement.tagName !== 'TEXTAREA') saveM();
});

// ═══ DIRECTORIO ═══
function openDirectorio() { document.getElementById('dir-modal').style.display = 'flex'; renderDirectorio(); }
function closeDirectorio() { document.getElementById('dir-modal').style.display = 'none'; }
function renderDirectorio() {
  const el = document.getElementById('dir-content'); let html = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return; const s = gs(n); const items = [];
    if (s.coord) items.push({ rol: `Coordinador ${n === 'MEDELLIN' ? 'ciudad' : 'municipal'}`, nombre: s.coord, phone: s.phone || '', zona: '' });
    Object.keys(RAW[n]).sort().forEach(ck => {
      const sc = (s.comunas || {})[ck] || {};
      if (sc.coord) items.push({ rol: 'Coord. zona', nombre: sc.coord, phone: sc.phone || '', zona: ck });
      RAW[n][ck].forEach(p => {
        const ps = (s.puestos || {})[pk(p)] || {};
        if (ps.coord) items.push({ rol: 'Coord. puesto', nombre: ps.coord, phone: ps.phone || '', zona: p.puesto });
      });
    });
    if (!items.length) return;
    html += `<div class="dir-section"><h3>${n === 'MEDELLIN' ? 'MEDELLÍN' : n} (${items.length})</h3>
      ${items.map(it => `<div class="dir-row">
        <div><div class="dir-name">${esc(it.nombre)}</div><div class="dir-role">${esc(it.rol)}${it.zona ? ' · ' + esc(it.zona) : ''}</div></div>
        <div class="dir-phone">${it.phone ? esc(it.phone) : '<span style="color:var(--t3)">Sin teléfono</span>'}</div>
      </div>`).join('')}</div>`;
  });
  if (!html) html = '<div class="dir-empty">Aún no hay coordinadores registrados.</div>';
  el.innerHTML = html;
}
function exportDirectorioPDF() {
  const now = new Date().toLocaleString('es-CO'); let sections = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return; const s = gs(n); const items = [];
    if (s.coord) items.push({ rol: `Coordinador ${n === 'MEDELLIN' ? 'ciudad' : 'municipal'}`, nombre: s.coord, phone: s.phone || '', zona: '' });
    Object.keys(RAW[n]).sort().forEach(ck => {
      const sc = (s.comunas || {})[ck] || {};
      if (sc.coord) items.push({ rol: 'Coord. zona', nombre: sc.coord, phone: sc.phone || '', zona: ck });
      RAW[n][ck].forEach(p => {
        const ps = (s.puestos || {})[pk(p)] || {};
        if (ps.coord) items.push({ rol: 'Coord. puesto', nombre: ps.coord, phone: ps.phone || '', zona: p.puesto });
      });
    });
    if (!items.length) return;
    sections += `<div style="margin-bottom:20px;page-break-inside:avoid">
      <h3 style="color:#1a2030;border-bottom:2px solid #f5c842;padding-bottom:6px;margin-bottom:10px;font-size:14px">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <tr style="background:#f0f0f0"><th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Nombre</th><th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Rol</th><th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Zona</th><th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Teléfono</th></tr>
        ${items.map(it => `<tr><td style="padding:5px 8px;border:1px solid #ddd">${esc(it.nombre)}</td><td style="padding:5px 8px;border:1px solid #ddd">${esc(it.rol)}</td><td style="padding:5px 8px;border:1px solid #ddd">${it.zona ? esc(it.zona) : '—'}</td><td style="padding:5px 8px;border:1px solid #ddd">${it.phone ? esc(it.phone) : '—'}</td></tr>`).join('')}
      </table></div>`;
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Directorio</title><style>body{font-family:Arial,sans-serif;padding:20px}@media print{body{padding:10px}}</style></head><body>
    <h1>👥 Directorio de Coordinadores — AMVA 2026</h1><div style="font-size:11px;color:#666;margin-bottom:24px">Generado: ${now}</div>
    ${sections || '<p>Sin coordinadores registrados.</p>'}</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ═══ START APP ═══
async function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  ST = loadLocalSt();
  setSyncBadge('syncing', '⏳ Cargando...');
  await loadFromFirestore();
  _innerPreload();
  saveLocalSt();
  setSyncBadge('synced', '✓ Datos cargados');
  setTimeout(() => setSyncBadge('', 'Sin cambios'), 2000);
  _initialized = true;
  buildSB();
  renderOV();
  buildExportMenu();
  buildExcelMenu();
  startListener();
  if (typeof initInactivityDetection === 'function') initInactivityDetection();
  // Show testigos management page button for authorized roles
  const _tBtnRole = window.CURRENT_USER && window.CURRENT_USER.role;
  if (_tBtnRole === 'SUPER_ADMIN' || _tBtnRole === 'REGIONAL_COORDINATOR') {
    const _tBtn = document.getElementById('btn-testigos-page');
    if (_tBtn) _tBtn.classList.remove('hidden');
  }
}

// ═══ EXPORT PDF ═══
function toggleExportMenu() { document.getElementById('export-menu').classList.toggle('show'); }
function toggleExcelMenu() { document.getElementById('excel-menu').classList.toggle('show'); }
document.addEventListener('click', function (e) {
  if (!e.target.closest('.export-wrap')) {
    document.getElementById('export-menu').classList.remove('show');
    document.getElementById('excel-menu').classList.remove('show');
  }
});

function buildExportMenu() {
  const list = document.getElementById('export-comuni-list'); if (!list) return;
  const sep = `<div style="height:1px;background:var(--b1);margin:4px 0"></div>`;
  const lbl = t => `<div style="font-size:9px;color:var(--t3);padding:3px 10px;text-transform:uppercase;letter-spacing:1px">${t}</div>`;
  let html = lbl('Por zona — Medellín');
  MEDELLIN_ZONAS.forEach(z => {
    html += `<div class="export-item" onclick="exportPDF('zona','MEDELLIN','${z.nombre.replace(/'/g, "\\'")}')">🗺 ${z.nombre}</div>`;
  });
  if (RAW['MEDELLIN']) {
    html += sep + lbl('Por comuna — Medellín');
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      html += `<div class="export-item" onclick="exportPDF('comuna','MEDELLIN','${ck.replace(/'/g, "\\'")}')">📑 ${ck}</div>`;
    });
  }
  Object.entries(REGIONES).filter(([r]) => r !== 'AMVA').forEach(([region, munis]) => {
    const valid = munis.filter(n => RAW[n]);
    if (!valid.length) return;
    html += sep + lbl(region);
    valid.forEach(n => { html += `<div class="export-item" onclick="exportPDF('muni','${n}','')">🏙️ ${n}</div>`; });
  });
  list.innerHTML = html;
}

function buildExcelMenu() {
  const list = document.getElementById('excel-comuni-list'); if (!list) return;
  const sep = `<div style="height:1px;background:var(--b1);margin:4px 0"></div>`;
  const lbl = t => `<div style="font-size:9px;color:var(--t3);padding:3px 10px;text-transform:uppercase;letter-spacing:1px">${t}</div>`;
  let html = lbl('Por zona — Medellín');
  MEDELLIN_ZONAS.forEach(z => {
    html += `<div class="export-item" onclick="exportExcel('zona','MEDELLIN','${z.nombre.replace(/'/g, "\\'")}')">🗺 ${z.nombre}</div>`;
  });
  if (RAW['MEDELLIN']) {
    html += sep + lbl('Por comuna — Medellín');
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      html += `<div class="export-item" onclick="exportExcel('comuna','MEDELLIN','${ck.replace(/'/g, "\\'")}')">📑 ${ck}</div>`;
    });
  }
  Object.entries(REGIONES).filter(([r]) => r !== 'AMVA').forEach(([region, munis]) => {
    const valid = munis.filter(n => RAW[n]);
    if (!valid.length) return;
    html += sep + lbl(region);
    valid.forEach(n => { html += `<div class="export-item" onclick="exportExcel('muni','${n}')">🏙️ ${n}</div>`; });
  });
  list.innerHTML = html;
}

function exportExcel(tipo, muni, ck) {
  document.getElementById('excel-menu').classList.remove('show');

  const TAG_LABELS = { n: 'Sin estado', ok: 'Cubierto', pr: 'Prioritario', pe: 'Pendiente', al: 'Alerta' };

  // Collect flat rows across municipalities (optionally filtered to one commune)
  function collectData(munis, ckFilter) {
    const isMulti = munis.length > 1;
    const rowsCoord = [], rowsTest = [], rowsMov = [];

    for (const n of munis) {
      if (!RAW[n]) continue;
      const s = gs(n);
      const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;
      const ckeys = Object.keys(RAW[n]).sort().filter(k => !ckFilter || (Array.isArray(ckFilter) ? ckFilter.includes(k) : k === ckFilter));

      for (const comunaKey of ckeys) {
        const puestos = RAW[n][comunaKey] || [];
        const sc = (s.comunas || {})[comunaKey] || {};
        const mov = s.movilidad?.[comunaKey] || {};
        const respNombres = (mov.responsables || []).map(r => r.nombre || '').filter(Boolean).join(' / ');
        const respTels    = (mov.responsables || []).map(r => r.telefono || '').filter(Boolean).join(' / ');

        rowsMov.push([...(isMulti ? [label] : []), comunaKey, sc.coord || '', sc.phone || '',
          mov.carros_nec || 0, mov.motos_nec || 0, respNombres, respTels]);

        for (const p of puestos) {
          const k = pk(p);
          const ps = (s.puestos || {})[k] || {};
          const testRows  = (s.testigos?.[comunaKey]?.[p.puesto]) || [];
          const testReg   = testRows.filter(r => r.nombre).length;
          const divipole  = `${String(p.dd).padStart(2,'0')}.${String(p.mm).padStart(3,'0')}.${String(p.zz).padStart(2,'0')}.${String(p.pp).padStart(2,'0')}`;

          rowsCoord.push([...(isMulti ? [label] : []),
            comunaKey, sc.coord || '', sc.phone || '',
            p.puesto, p.direccion, divipole, p.mesas || 0, p.total || 0,
            TAG_LABELS[ps.tag || 'n'], ps.coord || '', ps.phone || '',
            testReg]);

          testRows.forEach((r, i) => rowsTest.push([...(isMulti ? [label] : []),
            comunaKey, p.puesto, i + 1, r.nombre || '', r.telefono || '']));
        }
      }
    }
    return { rowsCoord, rowsTest, rowsMov, isMulti };
  }

  function withHeaders({ rowsCoord, rowsTest, rowsMov, isMulti }) {
    const m = isMulti ? ['Municipio'] : [];
    rowsCoord.unshift([...m, 'Zona / Comuna', 'Coord. Zona', 'Tel. Zona', 'Puesto', 'Dirección', 'DIVIPOLE', 'Mesas', 'Votantes', 'Estado', 'Coord. Puesto', 'Tel. Puesto', 'Testigos Reg.']);
    rowsTest.unshift([...m,  'Zona / Comuna', 'Puesto', '#', 'Nombre', 'Teléfono']);
    rowsMov.unshift([...m,   'Zona / Comuna', 'Coord. Zona', 'Tel. Zona', 'Carros Nec.', 'Motos Nec.', 'Responsable(s)', 'Tel. Responsable(s)']);
    return { rowsCoord, rowsTest, rowsMov };
  }

  function makeSheet(rows, colWidths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = colWidths.map(wch => ({ wch }));
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
    return ws;
  }

  function build(munis, ckFilter, filename) {
    const wb = XLSX.utils.book_new();
    const raw = collectData(munis, ckFilter);
    const { rowsCoord, rowsTest, rowsMov } = withHeaders(raw);
    const { isMulti } = raw;
    const M = isMulti ? [12] : [];

    XLSX.utils.book_append_sheet(wb,
      makeSheet(rowsCoord, [...M, 26, 24, 14, 32, 26, 12, 7, 10, 12, 24, 14, 10]), 'Coordinación');
    if (rowsTest.length > 1)
      XLSX.utils.book_append_sheet(wb,
        makeSheet(rowsTest, [...M, 26, 32, 4, 28, 14]), 'Testigos');
    XLSX.utils.book_append_sheet(wb,
      makeSheet(rowsMov, [...M, 26, 24, 14, 12, 12, 30, 20]), 'Movilidad');

    XLSX.writeFile(wb, filename);
  }

  if (tipo === 'all') {
    build(AMVA, null, 'Comando_Electoral_AMVA_2026.xlsx');
  } else if (tipo === 'medellin') {
    build(['MEDELLIN'], null, 'Comando_Electoral_Medellin_2026.xlsx');
  } else if (tipo === 'muni') {
    build([muni], null, 'Comando_Electoral_' + muni + '_2026.xlsx');
  } else if (tipo === 'comuna') {
    build([muni], ck, 'Comando_' + ck.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40) + '.xlsx');
  } else if (tipo === 'zona') {
    const zona = MEDELLIN_ZONAS.find(z => z.nombre === ck);
    if (zona) build(['MEDELLIN'], zona.comunas, 'Comando_Medellin_' + ck.replace(/[^a-zA-Z0-9]/g, '_') + '_2026.xlsx');
  }
}

function exportPDF(tipo, muni, ck) {
  document.getElementById('export-menu').classList.remove('show');
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(buildPrintHTML(tipo, muni, ck));
  win.document.close(); win.focus(); setTimeout(() => win.print(), 800);
}

function buildPrintHTML(tipo, muni, ck) {
  const now = new Date().toLocaleString('es-CO');
  let title = ''; let sections = '';
  function sectionForComuna(n, comunaKey) {
    const s = gs(n); const puestos = RAW[n][comunaKey] || [];
    const sc = (s.comunas || {})[comunaKey] || {};
    const mov = s.movilidad?.[comunaKey] || {};
    const respsP = (mov.responsables || []);
    let puestosHTML = '';
    puestos.forEach(p => {
      const k = pk(p); const ps = (s.puestos || {})[k] || {};
      const testRows = (s.testigos?.[comunaKey]?.[p.puesto]) || [];
      let testHTML = '';
      if (testRows.length > 0) {
        testHTML = `<div style="margin-top:6px"><b style="font-size:11px;color:#1a8f4a">Testigos (${testRows.filter(r => r.nombre).length}):</b>
          <table style="width:100%;font-size:10px;border-collapse:collapse;margin-top:3px">
            <tr style="background:#efffef"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Nombre</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Teléfono</th></tr>
            ${testRows.map(r => `<tr><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.nombre)}</td><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.telefono)}</td></tr>`).join('')}
          </table></div>`;
      }
      const tagLabels = { n: 'Sin estado', ok: '✓ Cubierto', pr: '★ Prioritario', pe: '⏳ Pendiente', al: '⚠ Alerta' };
      puestosHTML += `<div style="margin-bottom:12px;padding:10px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div><b style="font-size:12px">${p.puesto}</b><div style="font-size:10px;color:#666">${p.direccion}</div></div>
          <div style="text-align:right;font-size:10px">
            <div>${p.mesas || 0} mesas · ${(p.total || 0).toLocaleString('es-CO')} votantes</div>
            <div style="color:#888">${tagLabels[ps.tag || 'n']}</div>
            ${ps.coord ? `<div style="color:#1a6fd4">👤 ${esc(ps.coord)}${ps.phone ? ' · ' + esc(ps.phone) : ''}</div>` : ''}
          </div>
        </div>${testHTML}</div>`;
    });
    const movHTML = respsP.length ? `<div style="margin-top:8px;padding:8px;background:#fff8e6;border:1px solid #f5c842;border-radius:6px;font-size:11px">
      <b>Movilidad:</b>
      <table style="font-size:10px;border-collapse:collapse;width:100%;margin-top:4px"><tr style="background:#f0f0f0"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Responsable</th><th style="padding:3px 6px;border:1px solid #ddd">Teléfono</th><th style="padding:3px 6px;border:1px solid #ddd">🏍</th><th style="padding:3px 6px;border:1px solid #ddd">🚗</th></tr>
      ${respsP.map(r => `<tr><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.nombre)}</td><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.telefono)}</td><td style="padding:3px 6px;border:1px solid #ddd;text-align:center">${r.motos || 0}</td><td style="padding:3px 6px;border:1px solid #ddd;text-align:center">${r.carros || 0}</td></tr>`).join('')}
      </table></div>` : '';
    return `<div style="margin-bottom:24px;page-break-inside:avoid">
      <div style="background:#1a2030;color:#f5c842;padding:10px 14px;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:14px">${comunaKey}</b>
        <span style="font-size:11px;color:#aaa">Coord. zona: ${esc(sc.coord) || '—'}${sc.phone ? ' · ' + esc(sc.phone) : ''}</span>
      </div>${movHTML}<div style="margin-top:10px">${puestosHTML}</div></div>`;
  }
  if (tipo === 'all') {
    title = 'Reporte Completo — Antioquia';
    ALL_MUNIS.forEach(n => {
      if (!RAW[n]) return; const s = gs(n);
      sections += `<div style="page-break-before:always;padding-top:16px">
        <h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${n === 'MEDELLIN' ? 'MEDELLÍN' : n} — Coordinador: ${esc(s.coord) || 'Sin asignar'}${s.phone ? ' · ' + esc(s.phone) : ''}</h2>
        ${Object.keys(RAW[n]).sort().map(ck => sectionForComuna(n, ck)).join('')}</div>`;
    });
  } else if (tipo === 'zona') {
    const zona = MEDELLIN_ZONAS.find(z => z.nombre === ck);
    if (zona) {
      const s = gs('MEDELLIN'); const sz = (s.zonas || {})[ck] || {};
      title = `Reporte — MEDELLÍN · ${ck}`;
      sections = `<div><h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${ck}${sz.coord ? ' — Coord: ' + esc(sz.coord) + (sz.phone ? ' · ' + esc(sz.phone) : '') : ''}</h2>
        ${zona.comunas.filter(c => RAW['MEDELLIN'][c]).map(c => sectionForComuna('MEDELLIN', c)).join('')}</div>`;
    }
  } else if (tipo === 'comuna') {
    const s = gs(muni); title = `Reporte — MEDELLÍN · ${ck}`; sections = sectionForComuna(muni, ck);
  } else {
    const s = gs(muni); title = `Reporte — ${muni}`;
    sections = `<div><h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${muni} — Coordinador: ${esc(s.coord) || 'Sin asignar'}${s.phone ? ' · ' + esc(s.phone) : ''}</h2>
      ${Object.keys(RAW[muni]).sort().map(comunaKey => sectionForComuna(muni, comunaKey)).join('')}</div>`;
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:20px}h1{font-size:18px;color:#1a2030;margin-bottom:4px}.meta{font-size:11px;color:#666;margin-bottom:24px}@media print{body{padding:10px}}</style>
  </head><body><h1>⚡ ${title}</h1><div class="meta">Generado: ${now} · Comando Electoral AMVA 2026</div>${sections}</body></html>`;
}

// ═══ ABOGADO (punto 2) ═══
function renderAbogadoPanel(n, ck, id) {
  const pane = document.getElementById(id + '-abog');
  const s = gs(n);
  if (!s.abogados) s.abogados = {};
  if (!s.abogados[ck]) s.abogados[ck] = { nombre: '', firma: '', telefono: '' };
  const ab = s.abogados[ck];
  pane.innerHTML = `<div class="mov-panel">
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Abogado responsable de esta zona/comuna</div>
    <div class="mof" style="margin-bottom:8px"><label style="font-size:10px;color:var(--t3)">Nombre</label>
      <input class="resp-name-inp" style="width:100%" type="text" placeholder="Nombre completo" value="${esc(ab.nombre)}"
        onchange="updateAbogado('${n}','${ck.replace(/'/g,"\\'")}','nombre',this.value)"></div>
    <div class="mof" style="margin-bottom:12px"><label style="font-size:10px;color:var(--t3)">Teléfono / WhatsApp</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="resp-phone-inp" style="flex:1" type="text" placeholder="300 000 0000" value="${esc(ab.telefono)}"
          onchange="updateAbogado('${n}','${ck.replace(/'/g,"\\'")}','telefono',this.value)">
        ${ab.telefono ? `<a class="wa-btn" href="https://wa.me/57${ab.telefono.replace(/\D/g,'')}" target="_blank">💬</a>` : ''}
      </div></div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="mv-save-all" onclick="saveAbogado('${n}','${ck.replace(/'/g,"\\'")}','${id}')">💾 Guardar abogado</button>
      <span class="mv-ok" id="${id}-abog-ok">✓ Guardado</span>
    </div>
  </div>`;
}
function updateAbogado(n, ck, field, val) {
  const s = gs(n);
  if (!s.abogados) s.abogados = {};
  if (!s.abogados[ck]) s.abogados[ck] = { nombre: '', firma: '', telefono: '' };
  s.abogados[ck][field] = val;
  saveLocalSt();
}
function saveAbogado(n, ck, id) {
  writeMuni(n);
  const ok = document.getElementById(id + '-abog-ok');
  if (ok) { ok.style.opacity = 1; setTimeout(() => { ok.style.opacity = 0; }, 2000); }
  // Best-effort API sync
  if (window.api && window.CURRENT_USER) {
    const muniBackendId = _puestoIdCache[n]?._muniId;
    if (muniBackendId) {
      const s = gs(n);
      const ab = s.abogados[ck];
      if (ab) {
        if (ab._backendId) {
          api.patch(`/abogados/${ab._backendId}`, {
            name: ab.nombre || '',
            phone: ab.telefono || undefined,
            notes: ab.firma || undefined,
          }).catch(err => _onWriteError('abogado update failed', err));
        } else {
          api.post(`/municipios/${muniBackendId}/abogados`, {
            name: ab.nombre || '',
            phone: ab.telefono || undefined,
            notes: ab.firma || undefined,
          }).then(created => {
            ab._backendId = created.id;
            saveLocalSt();
          }).catch(err => _onWriteError('abogado create failed', err));
        }
      }
    }
  }
  renderAbogadoPanel(n, ck, id);
}

// ═══ REFRIGERIOS (punto 6) ═══
function renderRefrigPanel(n, ck, id) {
  const pane = document.getElementById(id + '-refrig');
  const s = gs(n);
  if (!s.refrigerios) s.refrigerios = {};
  if (!s.refrigerios[ck]) s.refrigerios[ck] = { nombre: '', telefono: '' };
  const rf = s.refrigerios[ck];
  pane.innerHTML = `<div class="mov-panel">
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Encargado de refrigerios para esta zona/comuna</div>
    <div class="mof" style="margin-bottom:8px"><label style="font-size:10px;color:var(--t3)">Nombre</label>
      <input class="resp-name-inp" style="width:100%" type="text" placeholder="Nombre completo" value="${esc(rf.nombre)}"
        onchange="updateRefrig('${n}','${ck.replace(/'/g,"\\'")}','nombre',this.value)"></div>
    <div class="mof" style="margin-bottom:12px"><label style="font-size:10px;color:var(--t3)">Teléfono / WhatsApp</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="resp-phone-inp" style="flex:1" type="text" placeholder="300 000 0000" value="${esc(rf.telefono)}"
          onchange="updateRefrig('${n}','${ck.replace(/'/g,"\\'")}','telefono',this.value)">
        ${rf.telefono ? `<a class="wa-btn" href="https://wa.me/57${rf.telefono.replace(/\D/g,'')}" target="_blank">💬</a>` : ''}
      </div></div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="mv-save-all" onclick="saveRefrig('${n}','${ck.replace(/'/g,"\\'")}','${id}')">💾 Guardar encargado</button>
      <span class="mv-ok" id="${id}-refrig-ok">✓ Guardado</span>
    </div>
  </div>`;
}
function updateRefrig(n, ck, field, val) {
  const s = gs(n);
  if (!s.refrigerios) s.refrigerios = {};
  if (!s.refrigerios[ck]) s.refrigerios[ck] = { nombre: '', telefono: '' };
  s.refrigerios[ck][field] = val;
  saveLocalSt();
}
function saveRefrig(n, ck, id) {
  writeMuni(n);
  const ok = document.getElementById(id + '-refrig-ok');
  if (ok) { ok.style.opacity = 1; setTimeout(() => { ok.style.opacity = 0; }, 2000); }
  // Best-effort API sync
  if (window.api && window.CURRENT_USER) {
    const muniBackendId = _puestoIdCache[n]?._muniId;
    if (muniBackendId) {
      const s = gs(n);
      const rf = s.refrigerios[ck];
      if (rf) {
        if (rf._backendId) {
          api.patch(`/refrigerios/${rf._backendId}`, {
            notes: rf.nombre || undefined,
          }).catch(err => _onWriteError('refrigerio update failed', err));
        } else {
          api.post('/refrigerios', {
            scopeType: 'MUNICIPIO',
            scopeId: muniBackendId,
            notes: rf.nombre || undefined,
          }).then(created => {
            rf._backendId = created.id;
            saveLocalSt();
          }).catch(err => _onWriteError('refrigerio create failed', err));
        }
      }
    }
  }
  renderRefrigPanel(n, ck, id);
}

// ═══ COMPARENDOS (punto 7) ═══
function renderComparendosPanel(n, ck, id) {
  const pane = document.getElementById(id + '-comp');
  const s = gs(n);
  if (!s.comparendos) s.comparendos = {};
  if (!s.comparendos[ck]) s.comparendos[ck] = [];
  const list = s.comparendos[ck];
  const rows = list.map((c, i) => `
    <div class="comp-row" style="background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:10px;font-weight:700;color:var(--gold)">Comparendo #${i+1}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <select style="font-size:10px;background:var(--bg2);color:var(--t1);border:1px solid var(--b1);border-radius:4px;padding:2px 4px"
            onchange="updateComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'estado',this.value)">
            <option value="pendiente" ${c.estado==='pendiente'?'selected':''}>⏳ Pendiente</option>
            <option value="resuelto" ${c.estado==='resuelto'?'selected':''}>✓ Resuelto</option>
          </select>
          <button class="del-btn" onclick="delComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'${id}')">×</button>
        </div>
      </div>
      <input class="resp-name-inp" style="width:100%;margin-bottom:5px" type="text" placeholder="Nombre" value="${esc(c.nombre || '')}"
        onchange="updateComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'nombre',this.value)">
      <input class="resp-name-inp" style="width:100%;margin-bottom:5px" type="text" placeholder="Puesto de votación" value="${esc(c.puesto)}"
        onchange="updateComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'puesto',this.value)">
      <div style="display:flex;gap:6px;margin-bottom:5px">
        <input class="resp-phone-inp" style="flex:1" type="date" value="${c.fecha||''}"
          onchange="updateComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'fecha',this.value)">
        <input class="resp-phone-inp" style="flex:1" type="text" placeholder="Tipo" value="${esc(c.tipo)}"
          onchange="updateComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'tipo',this.value)">
      </div>
      <textarea style="width:100%;font-size:11px;background:var(--bg2);color:var(--t1);border:1px solid var(--b1);border-radius:4px;padding:5px;box-sizing:border-box;resize:vertical;min-height:48px" placeholder="Notas / descripción"
        onchange="updateComparendo('${n}','${ck.replace(/'/g,"\\'")}',${i},'notas',this.value)">${esc(c.notas)}</textarea>
    </div>`).join('');
  pane.innerHTML = `<div class="mov-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:11px;color:var(--t3)">${list.length} comparendo(s) registrado(s)</span>
      <button class="resp-add-btn" onclick="addComparendo('${n}','${ck.replace(/'/g,"\\'")}','${id}')">+ Agregar comparendo</button>
    </div>
    <div id="${id}-comp-list">${rows || '<div style="font-size:11px;color:var(--t3);text-align:center;padding:12px">Sin comparendos registrados</div>'}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <button class="mv-save-all" onclick="saveComparendos('${n}','${ck.replace(/'/g,"\\'")}','${id}')">💾 Guardar comparendos</button>
      <span class="mv-ok" id="${id}-comp-ok">✓ Guardado</span>
    </div>
  </div>`;
}
function updateComparendo(n, ck, idx, field, val) {
  const s = gs(n);
  if (!s.comparendos) s.comparendos = {};
  if (!s.comparendos[ck]) s.comparendos[ck] = [];
  if (!s.comparendos[ck][idx]) return;
  s.comparendos[ck][idx][field] = val;
  saveLocalSt();
}
function addComparendo(n, ck, id) {
  const s = gs(n);
  if (!s.comparendos) s.comparendos = {};
  if (!s.comparendos[ck]) s.comparendos[ck] = [];
  s.comparendos[ck].push({ nombre: '', puesto: '', fecha: '', tipo: '', notas: '', estado: 'pendiente' });
  saveLocalSt();
  // Best-effort API sync
  if (window.api && window.CURRENT_USER) {
    const muniBackendId = _puestoIdCache[n]?._muniId;
    if (muniBackendId) {
      const newC = s.comparendos[ck][s.comparendos[ck].length - 1];
      api.post('/comparendos', {
        scopeType: 'MUNICIPIO',
        scopeId: muniBackendId,
        date: newC.fecha ? new Date(newC.fecha).toISOString() : new Date().toISOString(),
        description: newC.tipo || 'Sin descripción',
        status: 'abierto',
        notes: newC.notas || undefined,
      }).then(created => {
        newC._backendId = created.id;
        saveLocalSt();
      }).catch(err => _onWriteError('comparendo create failed', err));
    }
  }
  renderComparendosPanel(n, ck, id);
}
function delComparendo(n, ck, idx, id) {
  const s = gs(n);
  s.comparendos[ck].splice(idx, 1);
  saveLocalSt();
  renderComparendosPanel(n, ck, id);
}
function saveComparendos(n, ck, id) {
  writeMuni(n);
  const ok = document.getElementById(id + '-comp-ok');
  if (ok) { ok.style.opacity = 1; setTimeout(() => { ok.style.opacity = 0; }, 2000); }
  // Best-effort API sync: patch existing comparendos
  if (window.api && window.CURRENT_USER) {
    const s = gs(n);
    const list = s.comparendos?.[ck] || [];
    for (const c of list) {
      if (c._backendId) {
        api.patch(`/comparendos/${c._backendId}`, {
          date: c.fecha ? new Date(c.fecha).toISOString() : undefined,
          description: c.tipo || undefined,
          status: c.estado === 'resuelto' ? 'resuelto' : 'abierto',
          notes: c.notas || undefined,
        }).catch(err => _onWriteError('comparendo update failed', err));
      }
    }
  }
}

// ═══ MAPA DE PUESTOS (punto 4) ═══
const _maps = {};
function renderMapPanel(n, ck, id) {
  const pane = document.getElementById(id + '-mapa');
  const puestos = RAW[n][ck] || [];
  const validPuestos = puestos.filter(p => p.lat && p.lon && p.lat !== 0);
  if (!validPuestos.length) {
    pane.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">Sin coordenadas disponibles para esta zona</div>';
    return;
  }
  const mapId = id + '-leafmap';
  pane.innerHTML = `<div id="${mapId}" style="height:320px;border-radius:0 0 6px 6px"></div>`;
  setTimeout(() => {
    if (_maps[mapId]) { _maps[mapId].remove(); delete _maps[mapId]; }
    const s = gs(n);
    const center = [validPuestos[0].lat, validPuestos[0].lon];
    const map = L.map(mapId, { scrollWheelZoom: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18
    }).addTo(map);
    validPuestos.forEach(p => {
      const ts = (s.testigos?.[ck]?.[p.puesto] || []).length;
      const color = _testPctColor(ts > 0 ? 100 : 0);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 8, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
      }).addTo(map);
      marker.bindPopup(`<b style="font-size:12px">${p.puesto}</b><br><span style="font-size:11px;color:#666">${p.direccion || ''}</span><br><span style="font-size:10px">${p.mesas} mesas · ${(p.total||0).toLocaleString('es-CO')} votantes · ${ts} testigo${ts !== 1 ? 's' : ''}</span>`);
    });
    map.fitBounds(validPuestos.map(p => [p.lat, p.lon]), { padding: [20, 20] });
    _maps[mapId] = map;
  }, 50);
}

// ═══ DIRECTORIO TESTIGOS (punto 3) ═══
function openDirTestigos() { document.getElementById('dir-testigos-modal').style.display = 'flex'; renderDirTestigos(); }
function closeDirTestigos() { document.getElementById('dir-testigos-modal').style.display = 'none'; }
function renderDirTestigos() {
  const el = document.getElementById('dir-testigos-content'); let html = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniHtml = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const testByCk = s.testigos?.[ck] || {};
      const items = [];
      Object.entries(testByCk).forEach(([puesto, rows]) => {
        if (!Array.isArray(rows)) return;
        rows.filter(r => r.nombre).forEach(r => items.push({ puesto, nombre: r.nombre, telefono: r.telefono || '' }));
      });
      if (!items.length) return;
      muniHtml += `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:700;color:var(--gold);margin-bottom:4px">${ck}</div>
        ${items.map(it => `<div class="dir-row"><div><div class="dir-name">${esc(it.nombre)}</div><div class="dir-role">Testigo · ${esc(it.puesto)}</div></div>
          <div class="dir-phone">${it.telefono ? `<a class="wa-btn" href="https://wa.me/57${it.telefono.replace(/\D/g,'')}" target="_blank">💬</a> ${esc(it.telefono)}` : '<span style="color:var(--t3)">Sin teléfono</span>'}</div></div>`).join('')}</div>`;
    });
    if (!muniHtml) return;
    html += `<div class="dir-section"><h3>${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</h3>${muniHtml}</div>`;
  });
  el.innerHTML = html || '<div class="dir-empty">Sin testigos registrados aún.</div>';
}
function exportDirTestigosPDF() {
  const now = new Date().toLocaleString('es-CO'); let sections = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniRows = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const testByCk = s.testigos?.[ck] || {};
      Object.entries(testByCk).forEach(([puesto, rows]) => {
        if (!Array.isArray(rows)) return;
        rows.filter(r => r.nombre).forEach(r => {
          muniRows += `<tr><td style="padding:4px 8px;border:1px solid #ddd">${ck}</td><td style="padding:4px 8px;border:1px solid #ddd">${puesto}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(r.nombre)}</td><td style="padding:4px 8px;border:1px solid #ddd">${r.telefono ? esc(r.telefono) : '—'}</td></tr>`;
        });
      });
    });
    if (!muniRows) return;
    sections += `<div style="margin-bottom:20px;page-break-inside:avoid"><h3 style="color:#1a2030;border-bottom:2px solid #f5c842;padding-bottom:4px;font-size:13px">${n}</h3><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f0f0f0"><th style="padding:5px 8px;border:1px solid #ddd">Zona</th><th style="padding:5px 8px;border:1px solid #ddd">Puesto</th><th style="padding:5px 8px;border:1px solid #ddd">Nombre</th><th style="padding:5px 8px;border:1px solid #ddd">Teléfono</th></tr>${muniRows}</table></div>`;
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testigos</title><style>body{font-family:Arial,sans-serif;padding:20px}@media print{body{padding:10px}}</style></head><body><h1 style="font-size:16px;color:#1a2030">Directorio de Testigos Electorales</h1><div style="font-size:11px;color:#666;margin-bottom:20px">Generado: ${now}</div>${sections||'<p>Sin testigos registrados.</p>'}</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ═══ DIRECTORIO ABOGADOS (punto 3) ═══
function openDirAbogados() { document.getElementById('dir-abogados-modal').style.display = 'flex'; renderDirAbogados(); }
function closeDirAbogados() { document.getElementById('dir-abogados-modal').style.display = 'none'; }
function renderDirAbogados() {
  const el = document.getElementById('dir-abogados-content'); let html = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniHtml = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const ab = s.abogados?.[ck];
      if (!ab || !ab.nombre) return;
      muniHtml += `<div class="dir-row" style="margin-bottom:6px"><div><div class="dir-name">${esc(ab.nombre)}</div><div class="dir-role">⚖️ Abogado · ${ck}${ab.firma ? ' · ' + esc(ab.firma) : ''}</div></div>
        <div class="dir-phone">${ab.telefono ? `<a class="wa-btn" href="https://wa.me/57${ab.telefono.replace(/\D/g,'')}" target="_blank">💬</a> ${esc(ab.telefono)}` : '<span style="color:var(--t3)">Sin teléfono</span>'}</div></div>`;
    });
    if (!muniHtml) return;
    html += `<div class="dir-section"><h3>${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</h3>${muniHtml}</div>`;
  });
  el.innerHTML = html || '<div class="dir-empty">Sin abogados registrados aún.</div>';
}
function exportDirAbogadosPDF() {
  const now = new Date().toLocaleString('es-CO'); let sections = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniRows = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const ab = s.abogados?.[ck];
      if (ab && ab.nombre) muniRows += `<tr><td style="padding:4px 8px;border:1px solid #ddd">${ck}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(ab.nombre)}</td><td style="padding:4px 8px;border:1px solid #ddd">${ab.firma ? esc(ab.firma) : '—'}</td><td style="padding:4px 8px;border:1px solid #ddd">${ab.telefono ? esc(ab.telefono) : '—'}</td></tr>`;
    });
    if (!muniRows) return;
    sections += `<div style="margin-bottom:20px;page-break-inside:avoid"><h3 style="color:#1a2030;border-bottom:2px solid #f5c842;padding-bottom:4px;font-size:13px">${n}</h3><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f0f0f0"><th style="padding:5px 8px;border:1px solid #ddd">Zona</th><th style="padding:5px 8px;border:1px solid #ddd">Nombre</th><th style="padding:5px 8px;border:1px solid #ddd">Firma</th><th style="padding:5px 8px;border:1px solid #ddd">Teléfono</th></tr>${muniRows}</table></div>`;
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Abogados</title><style>body{font-family:Arial,sans-serif;padding:20px}@media print{body{padding:10px}}</style></head><body><h1 style="font-size:16px;color:#1a2030">Directorio de Abogados</h1><div style="font-size:11px;color:#666;margin-bottom:20px">Generado: ${now}</div>${sections||'<p>Sin abogados registrados.</p>'}</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ═══ COORDENADAS MUNICIPIOS ═══
const MUNI_COORDS = {
  // AMVA
  'MEDELLIN':           [6.2442, -75.5812],
  'BELLO':              [6.3386, -75.5581],
  'ITAGUI':             [6.1848, -75.5975],
  'ENVIGADO':           [6.1737, -75.5899],
  'SABANETA':           [6.1513, -75.6167],
  'LA ESTRELLA':        [6.1563, -75.6432],
  'CALDAS':             [6.0934, -75.6359],
  'COPACABANA':         [6.3494, -75.5057],
  'GIRARDOTA':          [6.3828, -75.4478],
  'BARBOSA':            [6.4382, -75.3327],
  // ORIENTE
  'ABEJORRAL':          [5.7870, -75.4330],
  'ALEJANDRIA':         [6.3654, -75.0952],
  'ARGELIA':            [5.7320, -75.1660],
  'CARMEN DE VIBORAL':  [6.0893, -75.3409],
  'COCORNA':            [6.0558, -74.9980],
  'CONCEPCION':         [6.4013, -75.0434],
  'GRANADA':            [6.1537, -74.9590],
  'GUARNE':             [6.2800, -75.4250],
  'GUATAPE':            [6.2322, -74.8771],
  'LA CEJA':            [6.0311, -75.4331],
  'LA UNION':           [5.9775, -75.3605],
  'MARINILLA':          [6.1744, -75.3370],
  'NARIÑO':             [5.8143, -75.1598],
  'EL PEÑOL':           [6.2113, -75.0082],
  'RETIRO':             [6.0608, -75.5135],
  'RIONEGRO':           [6.1551, -75.3740],
  'SAN CARLOS':         [6.1880, -74.9921],
  'SAN FRANCISCO':      [6.2913, -75.0356],
  'SAN LUIS':           [6.0390, -74.9965],
  'SAN RAFAEL':         [6.2958, -75.0215],
  'SAN VICENTE':        [6.3204, -75.3368],
  'SANTUARIO':          [6.1416, -75.2686],
  'SONSON':             [5.7107, -75.3128],
  // OCCIDENTE
  'ABRIAQI':            [7.0207, -76.3560],
  'ANTIOQUIA':          [6.5609, -75.7614],
  'ANZA':               [6.4003, -75.9232],
  'ARMENIA':            [6.4814, -75.8773],
  'BURITICA':           [6.7167, -75.9109],
  'CAICEDO':            [6.3987, -76.0010],
  'CAÑASGORDAS':        [6.7459, -76.0193],
  'DABEIBA':            [7.0053, -76.2670],
  'EBEJICO':            [6.3355, -75.8266],
  'FRONTINO':           [6.7741, -76.1320],
  'GIRALDO':            [6.6507, -75.9555],
  'HELICONIA':          [6.2050, -75.7540],
  'LIBORINA':           [6.6907, -75.8718],
  'OLAYA':              [6.5878, -75.8484],
  'PEQUE':              [6.9025, -76.0243],
  'SABANALARGA':        [6.8736, -75.9697],
  'SAN JERONIMO':       [6.3731, -75.7360],
  'SOPETRAN':           [6.5038, -75.7484],
  'URAMITA':            [6.9192, -76.1773],
  // SUROESTE
  'AMAGA':              [6.0418, -75.6990],
  'ANDES':              [5.6560, -75.8760],
  'ANGELOPOLIS':        [6.1080, -75.7143],
  'BETANIA':            [5.8083, -75.9763],
  'BETULIA':            [6.1079, -75.9840],
  'BOLIVAR':            [5.8586, -75.9368],
  'CARAMANTA':          [5.5412, -75.6600],
  'CONCORDIA':          [6.0460, -75.9022],
  'FREDONIA':           [5.9337, -75.6694],
  'HISPANIA':           [5.8095, -75.9082],
  'JARDIN':             [5.5987, -75.8150],
  'JERICO':             [5.7896, -75.7777],
  'LA PINTADA':         [5.7493, -75.5930],
  'MONTEBELLO':         [5.9414, -75.5118],
  'PUEBLORRICO':        [5.6683, -75.8997],
  'SALGAR':             [5.9549, -75.9743],
  'SANTA BARBARA':      [5.8733, -75.5726],
  'TAMESIS':            [5.6621, -75.7138],
  'TARSO':              [5.8093, -75.8186],
  'TITIRIBI':           [6.0768, -75.7880],
  'URRAO':              [6.3244, -76.1316],
  'VALPARAISO':         [5.7271, -75.6325],
  'VENECIA':            [5.9634, -75.7703],
  // NORDESTE
  'AMALFI':             [6.9119, -75.0726],
  'ANORI':              [7.0761, -75.1382],
  'CISNEROS':           [6.5398, -74.9954],
  'REMEDIOS':           [7.0261, -74.6919],
  'SAN ROQUE':          [6.4819, -74.9831],
  'SANTO DOMINGO':      [6.4782, -75.1441],
  'SEGOVIA':            [7.0879, -74.7049],
  'VEGACHI':            [6.8027, -74.8092],
  'YALI':               [6.5905, -75.0131],
  'YOLOMBO':            [6.5961, -74.9897],
  // NORTE
  'ANGOSTURA':          [6.8869, -75.3449],
  'BELMIRA':            [6.6077, -75.6658],
  'BRICEÑO':            [7.1115, -75.5266],
  'CAMPAMENTO':         [7.0022, -75.3048],
  'CAROLINA':           [6.7454, -75.3285],
  'DON MATIAS':         [6.4901, -75.4095],
  'ENTRERRIOS':         [6.5530, -75.5610],
  'GOMEZ PLATA':        [6.6349, -75.2165],
  'GUADALUPE':          [6.9018, -75.2370],
  'ITUANGO':            [7.1734, -75.7594],
  'SAN ANDRES':         [6.7069, -75.4823],
  'SAN JOSE DE LA MONTAÑA': [6.8320, -75.6800],
  'SAN PEDRO':          [6.4926, -75.5637],
  'SANTA ROSA DE OSOS': [6.6459, -75.4615],
  'TOLEDO':             [7.2820, -75.3830],
  'VALDIVIA':           [7.1628, -75.4362],
  'YARUMAL':            [7.0019, -75.4208],
  // URABÁ
  'APARTADO':           [7.8836, -76.6272],
  'ARBOLETES':          [8.8507, -76.4278],
  'CAREPA':             [7.7577, -76.6558],
  'CHIGORODO':          [7.6717, -76.6837],
  'MURINDO':            [6.9826, -76.7541],
  'MUTATA':             [7.2458, -76.4354],
  'NECOCLI':            [8.4296, -76.7856],
  'SAN JUAN DE URABA':  [8.7581, -76.5285],
  'SAN PEDRO DE URABA': [8.2839, -76.3784],
  'TURBO':              [8.0961, -76.7370],
  'VIGIA DEL FUERTE':   [6.6097, -76.8743],
  // BAJO CAUCA
  'CACERES':            [7.5754, -75.3498],
  'CAUCASIA':           [7.9854, -75.1971],
  'EL BAGRE':           [7.5928, -74.8087],
  'NECHI':              [8.1040, -74.7759],
  'TARAZA':             [7.5817, -75.4005],
  'ZARAGOZA':           [7.4908, -74.8668],
  // MAGDALENA MEDIO
  'CARACOLI':           [6.4450, -74.7648],
  'PUERTO NARE':        [6.1963, -74.5895],
  'MACEO':              [6.5428, -74.7755],
  'PUERTO BERRIO':      [6.4906, -74.4069],
  'PUERTO TRIUNFO':     [5.8733, -74.7322],
  'YONDO-CASABE':       [6.8182, -74.4441],
};

function _testPctColor(pct) {
  if (pct >= 71) return '#22c55e';
  if (pct >= 41) return '#f5c842';
  return '#ef4444';
}
function _coverageColor(tag) {
  if (tag === 'ok') return '#22c55e';
  if (tag === 'pr') return '#f5c842';
  if (tag === 'pe') return '#fb923c';
  if (tag === 'al') return '#ef4444';
  return '#64748b';
}

function _muniCoverageStats(n) {
  const s = gs(n); let total = 0, ok = 0, pr = 0, pe = 0, al = 0, none = 0;
  if (!RAW[n]) return { total, ok, pr, pe, al, none };
  Object.values(RAW[n]).forEach(puestos => {
    puestos.forEach(p => {
      total++;
      const tag = s.puestos?.[pk(p)]?.tag || 'n';
      if (tag === 'ok') ok++;
      else if (tag === 'pr') pr++;
      else if (tag === 'pe') pe++;
      else if (tag === 'al') al++;
      else none++;
    });
  });
  return { total, ok, pr, pe, al, none };
}

// ═══ MAPA POR MUNICIPIO ═══
let _muniLeafletMap = null;
function renderMuniMap(n) {
  const container = document.getElementById('ot-mapa-inner');
  if (!container) return;
  if (_muniLeafletMap) { try { _muniLeafletMap.remove(); } catch(e){} _muniLeafletMap = null; }
  container.innerHTML = '';

  const s = gs(n);
  const communes = RAW[n] ? Object.keys(RAW[n]).sort() : [];

  // Compute centroid of each commune from puesto lat/lon
  const communeData = [];
  const allLats = [], allLngs = [];
  communes.forEach(ck => {
    const puestos = RAW[n][ck] || [];
    const withCoords = puestos.filter(p => p.lat && p.lon);
    if (!withCoords.length) return;
    const lat = withCoords.reduce((s, p) => s + p.lat, 0) / withCoords.length;
    const lng = withCoords.reduce((s, p) => s + p.lon, 0) / withCoords.length;
    allLats.push(lat); allLngs.push(lng);

    const st = _ccStats(n, ck);
    communeData.push({ ck, lat, lng, testPct: st.pct, testReg: st.testReg, totMesas: st.totMesas });
  });

  const fallback = MUNI_COORDS[n] || [6.2442, -75.5812];
  const center = allLats.length
    ? [allLats.reduce((a, b) => a + b, 0) / allLats.length, allLngs.reduce((a, b) => a + b, 0) / allLngs.length]
    : fallback;

  _muniLeafletMap = L.map(container).setView(center, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(_muniLeafletMap);

  const bounds = [];
  communeData.forEach(({ ck, lat, lng, testPct, testReg, totMesas }) => {
    bounds.push([lat, lng]);
    const color = _testPctColor(testPct);
    const coord = s.comunas?.[ck]?.coord || '';
    const phone = s.comunas?.[ck]?.phone || '';

    L.circleMarker([lat, lng], {
      radius: 14, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
    }).addTo(_muniLeafletMap)
      .bindPopup(`<b>${esc(ck)}</b><br>Cobertura: ${testPct}% (${testReg}/${totMesas} mesas)${coord ? '<br>👤 ' + esc(coord) : ''}${phone ? '<br>📞 ' + esc(phone) : ''}`);
  });

  if (bounds.length > 1) _muniLeafletMap.fitBounds(bounds, { padding: [30, 30] });

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', '');
    div.style.cssText = 'background:rgba(15,23,42,.88);color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:11px;line-height:1.9';
    div.innerHTML = '<b>Cobertura testigos</b><br>' +
      '<span style="color:#22c55e">●</span> 71–100%<br>' +
      '<span style="color:#f5c842">●</span> 41–70%<br>' +
      '<span style="color:#ef4444">●</span> 0–40%';
    return div;
  };
  legend.addTo(_muniLeafletMap);
  setTimeout(() => _muniLeafletMap && _muniLeafletMap.invalidateSize(), 150);
}

// ═══ MAPA POR SUBREGIÓN ═══
let _regionLeafletMap = null;
function openRegionMap(region) {
  document.getElementById('region-map-modal').style.display = 'flex';
  document.getElementById('region-map-title').textContent = '🗺 Mapa — ' + region;
  const container = document.getElementById('region-map-container');
  if (_regionLeafletMap) { try { _regionLeafletMap.remove(); } catch(e){} _regionLeafletMap = null; }
  container.innerHTML = '';

  const munis = (REGIONES[region] || []).filter(n => RAW[n]);
  if (!munis.length) { container.innerHTML = '<div style="padding:20px;color:#94a3b8">Sin municipios con datos en esta región.</div>'; return; }

  const coords = munis.map(n => MUNI_COORDS[n]).filter(Boolean);
  const avgLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const avgLng = coords.reduce((s, c) => s + c[1], 0) / coords.length;

  _regionLeafletMap = L.map(container).setView([avgLat, avgLng], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(_regionLeafletMap);

  const bounds = [];
  munis.forEach(n => {
    const coord = MUNI_COORDS[n];
    if (!coord) return;
    bounds.push(coord);
    let totMesasN = 0, testRegN = 0;
    if (RAW[n]) Object.keys(RAW[n]).forEach(ck => { const st = _ccStats(n, ck); totMesasN += st.totMesas; testRegN += st.testReg; });
    const pct = totMesasN ? Math.round(testRegN / totMesasN * 100) : 0;
    const color = _testPctColor(pct);
    const s = gs(n);
    const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;

    L.circleMarker(coord, {
      radius: 16, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
    }).addTo(_regionLeafletMap)
      .bindPopup(`<b>${label}</b><br>Cobertura: ${pct}% (${testRegN}/${totMesasN} mesas)${s.coord ? '<br>👤 ' + s.coord : ''}`);

    L.tooltip({ permanent: true, direction: 'top', offset: [0, -18], className: 'map-muni-label' })
      .setContent(label).setLatLng(coord).addTo(_regionLeafletMap);
  });

  if (bounds.length > 1) _regionLeafletMap.fitBounds(bounds, { padding: [40, 40] });

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', '');
    div.style.cssText = 'background:rgba(15,23,42,.88);color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:11px;line-height:1.9';
    div.innerHTML = '<b>Cobertura testigos</b><br>' +
      '<span style="color:#22c55e">●</span> 71–100%<br>' +
      '<span style="color:#f5c842">●</span> 41–70%<br>' +
      '<span style="color:#ef4444">●</span> 0–40%';
    return div;
  };
  legend.addTo(_regionLeafletMap);
  setTimeout(() => _regionLeafletMap && _regionLeafletMap.invalidateSize(), 150);
}

function closeRegionMap() {
  document.getElementById('region-map-modal').style.display = 'none';
  if (_regionLeafletMap) { try { _regionLeafletMap.remove(); } catch(e){} _regionLeafletMap = null; }
}

// ═══ DELEGATED EVENT LISTENERS ═══
document.addEventListener('click', (e) => {
  const action = e.target.dataset?.action || e.target.closest('[data-action]')?.dataset?.action;
  if (action === 'go-home') goHome();
});
