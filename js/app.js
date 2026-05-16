// ═══ STATE ═══
let ST = {};
let _initialized = false;

function loadLocalSt() {
  try { return JSON.parse(localStorage.getItem('amva26v2') || '{}'); } catch (e) { return {}; }
}
function saveLocalSt() {
  try { localStorage.setItem('amva26v2', JSON.stringify(ST)); } catch (e) {}
}

function gs(n) {
  if (!ST[n]) ST[n] = { coord: '', phone: '', comunas: {}, puestos: {}, pregoneros: {}, testigos: {}, movilidad: {} };
  return ST[n];
}

function _innerPreload() {
  let changed = false;
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
  if (changed) saveLocalSt();
}

function pk(p) { return `${p.dd}_${p.mm}_${p.zz}_${p.pp}`; }
function cid(n, ck) { return 'cc_' + btoa(unescape(encodeURIComponent(n + ck))).replace(/[^a-z0-9]/gi, ''); }

// ═══ SIDEBAR ═══
let CUR = null, OPEN_CC = new Set();
function filterSB(q) { const ql = (q || '').toUpperCase(); document.querySelectorAll('.sb-item').forEach(el => { el.style.display = el.dataset.nm.includes(ql) ? '' : 'none'; }); }
function buildSB() {
  const list = document.getElementById('sb-list'); list.innerHTML = '';
  AMVA.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n);
    const totP = Object.values(RAW[n]).reduce((a, c) => a + c.length, 0);
    const d = document.createElement('div');
    d.className = 'sb-item' + (n === CUR ? ' on' : ''); d.dataset.nm = n; d.onclick = () => selMuni(n);
    d.innerHTML = `<div class="sb-nm">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</div><div class="sb-mt">${totP} puestos</div>${s.coord ? `<div class="sb-cd">👤 ${s.coord}</div>` : ''}`;
    list.appendChild(d);
  });
}
function selMuni(n) { CUR = n; buildSB(); renderMuni(n); }

// ═══ MUNI VIEW ═══
function renderMuni(n) {
  const comunas = RAW[n]; const s = gs(n); const ckeys = Object.keys(comunas).sort();
  let totP = 0, totM = 0, totV = 0;
  ckeys.forEach(c => comunas[c].forEach(p => { totP++; totM += (p.mesas || 0); totV += (p.total || 0); }));
  const isMed = (n === 'MEDELLIN'); const label = isMed ? 'MEDELLÍN' : n;
  document.getElementById('ct').innerHTML = `
    <div class="mh">
      <div><div class="mh-t">${label}</div><div class="mh-s">${totP} puestos · ${ckeys.length} zonas · ${totV.toLocaleString('es-CO')} votantes</div></div>
      <div class="mh-coord">
        <div><div class="cl">Coordinador ${isMed ? 'ciudad' : 'municipal'}</div><div class="cv" id="mh-cv">${s.coord || '—'}</div>${s.phone ? `<div class="cp">${s.phone}</div>` : ''}</div>
        <button class="ebtn" onclick="editMuni('${n}')">✎ Editar</button>
      </div>
    </div>
    <div class="stats">
      <div class="sc g"><div class="sl">Puestos</div><div class="sv">${totP}</div></div>
      <div class="sc b"><div class="sl">Mesas</div><div class="sv">${totM.toLocaleString('es-CO')}</div></div>
      <div class="sc"><div class="sl">Zonas</div><div class="sv">${ckeys.length}</div></div>
      <div class="sc gr"><div class="sl">Votantes</div><div class="sv">${(totV / 1000).toFixed(0)}K</div></div>
    </div>
    <div class="otabs">
      <div class="otab on" onclick="switchOTab(this,'ot-comunas')">Por Zonas/Comunas</div>
      <div class="otab" onclick="switchOTab(this,'ot-todos')">Todos los puestos</div>
    </div>
    <div id="ot-comunas" class="opane on"><div class="body" id="cc-body"></div></div>
    <div id="ot-todos" class="opane"><div class="body" id="at-body"></div></div>`;
  renderCCs(n);
}
function switchOTab(el, id) {
  document.querySelectorAll('.otab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.opane').forEach(p => p.classList.remove('on'));
  el.classList.add('on'); document.getElementById(id).classList.add('on');
  if (id === 'ot-todos') renderAllPuestos(CUR);
}

// ═══ COMMUNE CARDS ═══
function renderCCs(n) {
  const body = document.getElementById('cc-body'); body.innerHTML = '';
  Object.keys(RAW[n]).sort().forEach(ck => {
    const puestos = RAW[n][ck]; const s = gs(n); const sc = (s.comunas || {})[ck] || {};
    const totM = puestos.reduce((a, p) => a + (p.mesas || 0), 0); const totV = puestos.reduce((a, p) => a + (p.total || 0), 0);
    const cov = puestos.filter(p => (s.puestos[pk(p)] || {}).coord).length;
    const pct = puestos.length ? Math.round(cov / puestos.length * 100) : 0;
    const id = cid(n, ck); const isOpen = OPEN_CC.has(n + ck);
    const card = document.createElement('div'); card.className = 'cc'; card.id = id;
    const pregBase = PREG_BASE[n]?.[ck] || {};
    const totalPregNec = Object.values(pregBase).reduce((a, v) => a + (v || 0), 0);
    const savedPreg = s.pregoneros?.[ck] || {};
    const totalPregReg = Object.values(savedPreg).reduce((a, rows) => a + (Array.isArray(rows) ? rows.filter(r => r.nombre).length : 0), 0);
    const mov = s.movilidad?.[ck] || {};
    const resps = (mov.responsables) || [];
    card.innerHTML = `
      <div class="cc-hd" onclick="toggleCC('${n}','${ck.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}')">
        <div>
          <div class="cc-nm">${ck}</div>
          <div class="cc-crd-row">
            <span class="cc-crd-lbl">Coord:</span>
            <span class="cc-crd-val" id="${id}-cv">${sc.coord || '—'}</span>
            ${sc.phone ? `<span class="cc-crd-ph">· ${sc.phone}</span>` : ''}
            <button class="cc-ced" onclick="event.stopPropagation();editCC('${n}','${ck.replace(/'/g, "\\'")}')">✎</button>
          </div>
        </div>
        <div class="cc-r">
          <div class="cc-st"><div class="v">${puestos.length}</div><div class="l">puestos</div></div>
          <div class="cc-st"><div class="v" style="color:var(--preg)">${totalPregReg}/${totalPregNec}</div><div class="l">pregoneros</div></div>
          <div class="cc-st"><div class="v" style="color:var(--moto)">${resps.reduce((a, r) => a + (parseInt(r.motos) || 0), 0)}</div><div class="l">motos</div></div>
          <div class="cc-st"><div class="v" style="color:var(--car)">${resps.reduce((a, r) => a + (parseInt(r.carros) || 0), 0)}</div><div class="l">carros</div></div>
          <div class="chev${isOpen ? ' op' : ''}">▾</div>
        </div>
      </div>
      <div class="prog"><div class="prog-f" style="width:${pct}%"></div></div>
      <div class="cc-bd${isOpen ? ' op' : ''}" id="${id}-bd">
        <div class="itabs">
          <div class="itab on" onclick="switchIT(this,'${id}-puestos')">📋 Puestos (${puestos.length})</div>
          <div class="itab" onclick="switchIT(this,'${id}-preg');renderPregPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">📢 Pregoneros / Testigos</div>
          <div class="itab" onclick="switchIT(this,'${id}-mov');renderMovPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🚗 Movilidad</div>
        </div>
        <div class="ipane on" id="${id}-puestos"><div style="padding:8px">${buildPT(n, puestos, ck)}</div></div>
        <div class="ipane" id="${id}-preg"></div>
        <div class="ipane" id="${id}-mov"></div>
      </div>`;
    body.appendChild(card);
  });
}
function switchIT(el, paneid) {
  const bd = el.closest('.cc-bd');
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

// ═══ PUESTOS ═══
function buildPT(n, puestos, ckKey) {
  const s = gs(n);
  const pregBase = PREG_BASE[n]?.[ckKey] || {};
  const savedCnts = (s.pregoneros?.[ckKey]?._counts) || {};
  return puestos.map(p => {
    const k = pk(p); const ps = (s.puestos || {})[k] || {};
    const t = ps.tag || 'n'; const tg = TAGS[t] || TAGS.n;
    const map = p.lat && p.lon ? `<a class="map-a" href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank">🗺</a>` : '';
    const baseCnt = pregBase[p.puesto] !== undefined ? pregBase[p.puesto] : 0;
    const pregCnt = savedCnts[p.puesto] !== undefined ? savedCnts[p.puesto] : baseCnt;
    const pregReg = ((s.pregoneros?.[ckKey]?.[p.puesto]) || []).filter(r => r.nombre).length;
    const testReg = ((s.testigos?.[ckKey]?.[p.puesto]) || []).filter(r => r.nombre).length;
    const divipole = `${String(p.dd).padStart(2, '0')}.${String(p.mm).padStart(3, '0')}.${String(p.zz).padStart(2, '0')}.${String(p.pp).padStart(2, '0')}`;
    const pcid = 'pc_' + k + '_' + btoa(unescape(encodeURIComponent(ckKey))).replace(/[^a-z0-9]/gi, '');
    const coordPill = ps.coord
      ? `<span class="pc-pill coord" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')" title="${ps.phone || ''}">👤 ${ps.coord}</span>`
      : `<span class="pc-pill nocoord" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')">+ Coord. puesto</span>`;
    return `<div class="pc" id="${pcid}">
      <div class="pc-hd" onclick="togglePC('${pcid}')">
        <div class="pc-left">
          <div class="pc-nm">${p.puesto}</div>
          <div class="pc-dir">${p.direccion}</div>
          <div class="pc-pills">
            <span class="pcode">${divipole}</span>
            <span class="pc-pill">${p.mesas || 0} mesas</span>
            <span class="pc-pill">${(p.total || 0).toLocaleString('es-CO')} v.</span>
            <button class="${tg.cls} tbtn" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}');">${tg.lbl}</button>
            ${coordPill}
            ${pregCnt > 0 ? `<span class="pc-pill" style="color:var(--preg);border-color:rgba(167,139,250,.3)">📢 ${pregReg}/${pregCnt}</span>` : ''}
            ${testReg > 0 ? `<span class="pc-pill" style="color:var(--green);border-color:rgba(46,216,122,.3)">🧾 ${testReg}</span>` : ''}
            ${map}
          </div>
        </div>
        <div class="pc-right"><div class="pc-chev" id="${pcid}-chev">▾</div></div>
      </div>
      <div class="pc-body" id="${pcid}-body">
        <div class="pc-section">
          <div class="pc-section-title">Coordinador del puesto</div>
          <div class="pc-coord-row">
            <input class="pc-inp" type="text" placeholder="Nombre coordinador" value="${ps.coord || ''}" id="${pcid}-coord">
            <input class="pc-inp" type="text" placeholder="Teléfono" value="${ps.phone || ''}" id="${pcid}-phone" style="max-width:150px">
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
        ${ps.notes ? `<div style="font-size:11px;color:var(--t2);background:var(--bg);border-radius:5px;padding:6px 9px;margin-bottom:8px">📝 ${ps.notes}</div>` : ''}
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
  // Write only the changed puesto fields
  await writeFields({
    [`${n}.puestos.${k}.coord`]: coord,
    [`${n}.puestos.${k}.phone`]: phone,
    [`${n}.puestos.${k}.tag`]: tag
  });
  const tg = TAGS[tag] || TAGS.n;
  const tagBtn = document.querySelector(`#${pcid} .tbtn`);
  if (tagBtn) { tagBtn.className = tg.cls + ' tbtn'; tagBtn.textContent = tg.lbl; }
  const coordPills = document.querySelectorAll(`#${pcid} .pc-pill.coord, #${pcid} .pc-pill.nocoord`);
  coordPills.forEach(el => {
    el.className = coord ? 'pc-pill coord' : 'pc-pill nocoord';
    el.textContent = coord ? '👤 ' + coord : '+ Coord. puesto';
    el.title = phone || '';
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
function renderAllPuestos(n) {
  const body = document.getElementById('at-body'); let html = '';
  Object.entries(RAW[n]).sort(([a], [b]) => a.localeCompare(b)).forEach(([ck, puestos]) => {
    html += `<div style="margin-bottom:14px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--t3);padding:6px 8px;margin-bottom:4px;border-bottom:1px solid var(--b1)">${ck}</div>
      ${buildPT(n, puestos, ck)}
    </div>`;
  });
  body.innerHTML = html;
}

// ═══ PREGONEROS ═══
function renderPregPanel(n, ck, id) {
  const pane = document.getElementById(id + '-preg');
  const s = gs(n);
  if (!s.pregoneros) s.pregoneros = {};
  if (!s.pregoneros[ck]) s.pregoneros[ck] = {};
  const pregBase = PREG_BASE[n]?.[ck] || {};
  const puestosList = RAW[n][ck] || [];
  const savedCounts = (s.pregoneros[ck]._counts) || {};
  const savedData = s.pregoneros[ck];
  let totalNec = 0, totalReg = 0;
  puestosList.forEach(p => {
    const baseCnt = pregBase[p.puesto] !== undefined ? pregBase[p.puesto] : 0;
    const savedCnt = savedCounts[p.puesto] !== undefined ? savedCounts[p.puesto] : baseCnt;
    totalNec += savedCnt;
    const rows = savedData[p.puesto] || [];
    totalReg += rows.filter(r => r.nombre).length;
  });
  const globalNec = savedData._global_nec || 0;
  let html = `<div class="preg-panel">
    <div class="count-row">
      <div class="count-badge"><span class="lbl">📢 Registrados:</span><span class="val" style="color:var(--preg)">${totalReg}</span></div>
      <div class="count-badge"><span class="lbl">🎯 Necesarios:</span>
        <input class="count-inp" type="number" min="0" value="${globalNec || totalNec}"
          onchange="savePregCount('${n}','${ck.replace(/'/g, "\\'")}','${id}',this.value)">
      </div>
    </div>`;
  puestosList.forEach(p => {
    const pName = p.puesto;
    const baseCnt = pregBase[pName] !== undefined ? pregBase[pName] : 0;
    const savedCnt = savedCounts[pName] !== undefined ? savedCounts[pName] : baseCnt;
    const rows = savedData[pName] || [];
    while (rows.length < savedCnt) rows.push({ nombre: '', cedula: '', responsable: '', telefono: '' });
    const regCnt = rows.filter(r => r.nombre).length;
    const testReg = getTestigos(n, ck, pName).filter(t => t.nombre).length;
    const pKey = encodeURIComponent(pName);
    const ppid = `${id}-pp-${btoa(pKey).replace(/=/g, '')}`;
    const coordPuesto = (s.puestos || {})[pk(p)] || {};
    html += `<div class="puesto-preg">
      <div class="pp-hd" onclick="togglePP('${ppid}')">
        <span class="pp-nm" title="${pName}">${pName}</span>
        <div class="pp-right">
          <div class="pp-pills">
            ${coordPuesto.coord ? `<span class="pp-pill" style="color:var(--blue);border-color:rgba(74,158,255,.3)">👤 ${coordPuesto.coord}</span>` : ''}
            <span class="pp-pill ${regCnt > 0 ? 'ok' : ''}">📢 ${regCnt}/${savedCnt}</span>
            ${testReg > 0 ? `<span class="pp-pill test">🧾 ${testReg}</span>` : ''}
          </div>
          <span class="pp-chev" id="${ppid}-chev">▾</span>
        </div>
      </div>
      <div class="pp-body" id="${ppid}">
        <div class="pp-campos-row">
          <label>Nº pregoneros:</label>
          <input class="count-inp" style="width:50px" type="number" min="0" value="${savedCnt}"
            onchange="setPregCount('${n}','${ck.replace(/'/g, "\\'")}','${id}','${pKey}',this.value)"
            onclick="event.stopPropagation()">
          <span style="font-size:9px;color:var(--t3)">${regCnt} de ${savedCnt}</span>
        </div>
        <div id="${ppid}-rows">${buildPregRows(n, ck, pName, rows, savedCnt, id, pKey)}</div>
        <div class="test-section">
          <h5>🧾 Testigos electorales <span style="color:var(--t3);font-weight:400">(${testReg})</span></h5>
          <div id="${id}-test-${btoa(pKey).replace(/=/g, '')}">${buildTestRows(n, ck, pName, id, pKey)}</div>
          <button class="add-btn" onclick="addTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}','${id}')">+ Agregar testigo</button>
        </div>
      </div>
    </div>`;
  });
  html += `<div style="margin-top:8px;display:flex;justify-content:flex-end;gap:8px">
    <button class="save-btn" onclick="saveAllPreg('${n}','${ck.replace(/'/g, "\\'")}','${id}')">💾 Guardar todo</button>
    <span class="saved-ok" id="${id}-preg-ok">✓ Guardado</span>
  </div></div>`;
  pane.innerHTML = html;
}

function buildPregRows(n, ck, pName, rows, count, id, pKey) {
  let html = '';
  for (let i = 0; i < Math.max(count, 0); i++) {
    const r = rows[i] || {};
    html += `<div class="preg-row">
      <span class="row-num">${i + 1}</span>
      <input class="pi" style="flex:2" type="text" placeholder="Nombre" value="${r.nombre || ''}"
        onchange="updatePregField('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'nombre',this.value)">
      <input class="pi pi-sm" type="text" placeholder="Cédula" value="${r.cedula || ''}"
        onchange="updatePregField('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'cedula',this.value)">
      <input class="pi pi-sm" type="text" placeholder="Responsable" value="${r.responsable || ''}"
        onchange="updatePregField('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'responsable',this.value)">
      <input class="pi pi-sm" type="text" placeholder="Teléfono" value="${r.telefono || ''}"
        onchange="updatePregField('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'telefono',this.value)">
    </div>`;
  }
  return html || '<div style="font-size:10px;color:var(--t3);padding:4px 0">Sin campos (edita el número)</div>';
}

function getTestigos(n, ck, pName) { return (gs(n).testigos?.[ck]?.[pName]) || []; }

function buildTestRows(n, ck, pName, id, pKey) {
  const rows = getTestigos(n, ck, pName);
  if (!rows.length) return '<div style="font-size:10px;color:var(--t3);padding:2px 0">Sin testigos aún</div>';
  return rows.map((r, i) => `<div class="test-row">
    <input class="pi" style="flex:2" type="text" placeholder="Nombre" value="${r.nombre || ''}"
      onchange="updateTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'nombre',this.value)">
    <input class="pi pi-sm" type="text" placeholder="Teléfono" value="${r.telefono || ''}"
      onchange="updateTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'telefono',this.value)">
    <button class="del-btn" onclick="delTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'${id}')">×</button>
  </div>`).join('');
}

function updatePregField(n, ck, pKey, idx, field, val) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.pregoneros) s.pregoneros = {}; if (!s.pregoneros[ck]) s.pregoneros[ck] = {};
  if (!s.pregoneros[ck][pName]) s.pregoneros[ck][pName] = [];
  while (s.pregoneros[ck][pName].length <= idx) s.pregoneros[ck][pName].push({ nombre: '', cedula: '', responsable: '', telefono: '' });
  s.pregoneros[ck][pName][idx][field] = val;
  saveLocalSt(); // local only while typing; full save on button
}

function setPregCount(n, ck, id, pKey, val) {
  const s = gs(n); const cnt = parseInt(val) || 0; const pName = decodeURIComponent(pKey);
  if (!s.pregoneros) s.pregoneros = {}; if (!s.pregoneros[ck]) s.pregoneros[ck] = {};
  if (!s.pregoneros[ck]._counts) s.pregoneros[ck]._counts = {};
  s.pregoneros[ck]._counts[pName] = cnt;
  if (!s.pregoneros[ck][pName]) s.pregoneros[ck][pName] = [];
  while (s.pregoneros[ck][pName].length < cnt) s.pregoneros[ck][pName].push({ nombre: '', cedula: '', responsable: '', telefono: '' });
  saveLocalSt();
  const ppid = `${id}-pp-${btoa(pKey).replace(/=/g, '')}`;
  const rowsEl = document.getElementById(ppid + '-rows');
  if (rowsEl) rowsEl.innerHTML = buildPregRows(n, ck, pName, s.pregoneros[ck][pName], cnt, id, pKey);
}

function savePregCount(n, ck, id, val) {
  const s = gs(n); const cnt = parseInt(val) || 0;
  if (!s.pregoneros) s.pregoneros = {}; if (!s.pregoneros[ck]) s.pregoneros[ck] = {};
  s.pregoneros[ck]._global_nec = cnt; saveLocalSt();
}

async function saveAllPreg(n, ck, id) {
  const s = gs(n);
  saveLocalSt();
  // Write entire pregoneros[ck] as a single field update
  await writeField(`${n}.pregoneros.${ck}`, s.pregoneros?.[ck] || {});
  const ok = document.getElementById(id + '-preg-ok');
  if (ok) { ok.classList.add('show'); setTimeout(() => ok.classList.remove('show'), 2000); }
  renderCCs(n);
}

function addTestigo(n, ck, pKey, id) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.testigos) s.testigos = {}; if (!s.testigos[ck]) s.testigos[ck] = {};
  if (!s.testigos[ck][pName]) s.testigos[ck][pName] = [];
  s.testigos[ck][pName].push({ nombre: '', telefono: '' }); saveLocalSt();
  const el = document.getElementById(`${id}-test-${btoa(pKey).replace(/=/g, '')}`);
  if (el) el.innerHTML = buildTestRows(n, ck, pName, id, pKey);
}

function updateTestigo(n, ck, pKey, idx, field, val) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.testigos) s.testigos = {}; if (!s.testigos[ck]) s.testigos[ck] = {};
  if (!s.testigos[ck][pName]) s.testigos[ck][pName] = [];
  if (!s.testigos[ck][pName][idx]) s.testigos[ck][pName][idx] = { nombre: '', telefono: '' };
  s.testigos[ck][pName][idx][field] = val; saveLocalSt();
}

function delTestigo(n, ck, pKey, idx, id) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  s.testigos[ck][pName].splice(idx, 1); saveLocalSt();
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
          <input class="resp-name-inp" type="text" placeholder="Nombre" value="${r.nombre || ''}"
            onchange="updateResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'nombre',this.value,'${id}')">
          <input class="resp-phone-inp" type="text" placeholder="Teléfono" value="${r.telefono || ''}"
            onchange="updateResp('${n}','${ck.replace(/'/g, "\\'")}',${i},'telefono',this.value,'${id}')">
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
  const resps = s.movilidad[ck].responsables;
  const mo = resps.reduce((a, r) => a + (parseInt(r.motos) || 0), 0);
  const ca = resps.reduce((a, r) => a + (parseInt(r.carros) || 0), 0);
  const moEl = document.getElementById(id + '-tot-mo'); if (moEl) moEl.textContent = mo;
  const caEl = document.getElementById(id + '-tot-ca'); if (caEl) caEl.textContent = ca;
}
function addResp(n, ck, id) {
  const s = gs(n);
  if (!s.movilidad[ck].responsables) s.movilidad[ck].responsables = [];
  s.movilidad[ck].responsables.push({ nombre: '', telefono: '', motos: 0, carros: 0 });
  saveLocalSt(); renderMovPanel(n, ck, id);
}
function delResp(n, ck, idx, id) {
  const s = gs(n); s.movilidad[ck].responsables.splice(idx, 1);
  saveLocalSt(); renderMovPanel(n, ck, id);
}
function saveMovNec(n, ck, field, val) {
  const s = gs(n); if (!s.movilidad) s.movilidad = {}; if (!s.movilidad[ck]) s.movilidad[ck] = { responsables: [], motos_nec: 0, carros_nec: 0 };
  s.movilidad[ck][field] = parseInt(val) || 0; saveLocalSt();
}
async function saveMovAll(n, ck, id) {
  const s = gs(n);
  saveLocalSt();
  await writeField(`${n}.movilidad.${ck}`, s.movilidad?.[ck] || {});
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
    await writeFields({ [`${MCX.n}.coord`]: coord, [`${MCX.n}.phone`]: phone });
  } else if (MCX.type === 'cc') {
    if (!s.comunas) s.comunas = {}; s.comunas[MCX.ck] = { coord, phone };
    saveLocalSt();
    await writeFields({ [`${MCX.n}.comunas.${MCX.ck}.coord`]: coord, [`${MCX.n}.comunas.${MCX.ck}.phone`]: phone });
  } else if (MCX.type === 'p') {
    if (!s.puestos) s.puestos = {}; s.puestos[MCX.k] = { coord, phone, tag: SEL_T, notes };
    saveLocalSt();
    await writeFields({
      [`${MCX.n}.puestos.${MCX.k}.coord`]: coord,
      [`${MCX.n}.puestos.${MCX.k}.phone`]: phone,
      [`${MCX.n}.puestos.${MCX.k}.tag`]: SEL_T,
      [`${MCX.n}.puestos.${MCX.k}.notes`]: notes
    });
  }
  if (MCX.type === 'muni') {
    const el = document.getElementById('mh-cv'); if (el) el.textContent = coord || '—'; buildSB();
  } else if (MCX.type === 'cc') {
    const el = document.getElementById(cid(MCX.n, MCX.ck) + '-cv'); if (el) el.textContent = coord || '—';
  } else if (MCX.type === 'p') {
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
    else renderCCs(MCX.n);
  }
  closeM();
}
function editMuni(n) { const s = gs(n); openM(`Coordinador — ${n === 'MEDELLIN' ? 'MEDELLÍN' : n}`, 'Coordinador principal', { type: 'muni', n }, { coord: s.coord, phone: s.phone }); }
function editCC(n, ck) { const s = gs(n); const sc = (s.comunas || {})[ck] || {}; openM('Coordinador de zona', ck, { type: 'cc', n, ck }, { coord: sc.coord, phone: sc.phone }); }
function editP(n, k, ck) { if (ck !== undefined) { editPCard(n, k, ck); return; } const s = gs(n); const ps = (s.puestos || {})[k] || {}; openM('Puesto de votación', k.replace(/_/g, ' '), { type: 'p', n, k }, { coord: ps.coord, phone: ps.phone, tag: ps.tag || 'n', notes: ps.notes, showTag: true, showNotes: true }); }

// ═══ OVERVIEW ═══
function renderOV() {
  const wrap = document.getElementById('ov-wrap'); if (!wrap) return;
  let html = `<div class="sec-t">10 Municipios del Área Metropolitana</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px">`;
  AMVA.forEach(n => {
    if (!RAW[n]) return; const s = gs(n);
    const totP = Object.values(RAW[n]).reduce((a, c) => a + c.length, 0);
    html += `<div style="background:var(--card);border:1px solid var(--b1);border-radius:var(--r);padding:13px;cursor:pointer;transition:all .12s" onclick="selMuni('${n}')" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--b1)'">
      <div style="font-size:13px;font-weight:700">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</div>
      <div style="font-size:9px;color:var(--t3);margin-top:2px">${Object.keys(RAW[n]).length} zonas · ${totP} puestos</div>
      ${s.coord ? `<div style="font-size:9px;color:var(--blue);margin-top:5px">👤 ${s.coord}</div>` : `<div style="font-size:9px;color:var(--t3);font-style:italic;margin-top:5px">Sin coordinador asignado</div>`}
    </div>`;
  });
  html += '</div>'; wrap.innerHTML = html;
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
  AMVA.forEach(n => {
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
        <div><div class="dir-name">${it.nombre}</div><div class="dir-role">${it.rol}${it.zona ? ' · ' + it.zona : ''}</div></div>
        <div class="dir-phone">${it.phone || '<span style="color:var(--t3)">Sin teléfono</span>'}</div>
      </div>`).join('')}</div>`;
  });
  if (!html) html = '<div class="dir-empty">Aún no hay coordinadores registrados.</div>';
  el.innerHTML = html;
}
function exportDirectorioPDF() {
  const now = new Date().toLocaleString('es-CO'); let sections = '';
  AMVA.forEach(n => {
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
        ${items.map(it => `<tr><td style="padding:5px 8px;border:1px solid #ddd">${it.nombre}</td><td style="padding:5px 8px;border:1px solid #ddd">${it.rol}</td><td style="padding:5px 8px;border:1px solid #ddd">${it.zona || '—'}</td><td style="padding:5px 8px;border:1px solid #ddd">${it.phone || '—'}</td></tr>`).join('')}
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
  ST = loadLocalSt();
  setSyncBadge('syncing', '⏳ Cargando...');
  const loaded = await loadFromFirestore();
  setSyncBadge(loaded ? 'synced' : '', loaded ? '✓ Datos cargados' : 'Sin cambios');
  setTimeout(() => setSyncBadge('', 'Sin cambios'), 3000);
  _initialized = true;
  _innerPreload();
  buildSB();
  renderOV();
  buildExportMenu();
  buildExcelMenu();
  startListener();
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
  let html = '';
  if (RAW['MEDELLIN']) {
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      const safe = ck.replace(/'/g, "\\'");
      html += `<div class="export-item" onclick="exportPDF('comuna','MEDELLIN','${safe}')">📑 MED · ${ck}</div>`;
    });
  }
  AMVA.filter(n => n !== 'MEDELLIN').forEach(n => {
    if (RAW[n]) html += `<div class="export-item" onclick="exportPDF('muni','${n}','')">🏙️ ${n}</div>`;
  });
  list.innerHTML = html;
}

function buildExcelMenu() {
  const list = document.getElementById('excel-comuni-list'); if (!list) return;
  let html = '';
  if (RAW['MEDELLIN']) {
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      const safe = ck.replace(/'/g, "\\'");
      html += `<div class="export-item" onclick="exportExcel('comuna','MEDELLIN','${safe}')">📑 MED · ${ck}</div>`;
    });
  }
  AMVA.filter(n => n !== 'MEDELLIN').forEach(n => {
    if (RAW[n]) html += `<div class="export-item" onclick="exportExcel('muni','${n}')">🏙️ ${n}</div>`;
  });
  list.innerHTML = html;
}

function exportExcel(tipo, muni, ck) {
  document.getElementById('excel-menu').classList.remove('show');
  const wb = XLSX.utils.book_new();
  function sheetForComuna(n, comunaKey) {
    const s = gs(n); const puestos = RAW[n][comunaKey] || [];
    const sc = (s.comunas || {})[comunaKey] || {};
    const pregBase = PREG_BASE[n]?.[comunaKey] || {};
    const mov = s.movilidad?.[comunaKey] || {};
    const respsE = (mov.responsables || []);
    const rows = [];
    rows.push(['ZONA / COMUNA', comunaKey]);
    rows.push(['Coordinador de zona', sc.coord || '', 'Teléfono', sc.phone || '']);
    rows.push([]);
    rows.push(['MOVILIDAD', '', '', '']);
    rows.push(['Motos necesarias', mov.motos_nec || 0, 'Carros necesarios', mov.carros_nec || 0]);
    if (respsE.length) {
      rows.push(['Responsable', 'Teléfono', 'Motos', 'Carros']);
      respsE.forEach(r => rows.push([r.nombre || '', r.telefono || '', r.motos || 0, r.carros || 0]));
    }
    rows.push([]);
    puestos.forEach(p => {
      const k = pk(p); const ps = (s.puestos || {})[k] || {};
      const pregRows = (s.pregoneros?.[comunaKey]?.[p.puesto]) || [];
      const testRows = (s.testigos?.[comunaKey]?.[p.puesto]) || [];
      const savedCnts = (s.pregoneros?.[comunaKey]?._counts) || {};
      const baseCnt = pregBase[p.puesto] !== undefined ? pregBase[p.puesto] : 0;
      const cnt = savedCnts[p.puesto] !== undefined ? savedCnts[p.puesto] : baseCnt;
      const tagLabels = { n: 'Sin estado', ok: 'Cubierto', pr: 'Prioritario', pe: 'Pendiente', al: 'Alerta' };
      const divipole = `${String(p.dd).padStart(2, '0')}.${String(p.mm).padStart(3, '0')}.${String(p.zz).padStart(2, '0')}.${String(p.pp).padStart(2, '0')}`;
      rows.push(['PUESTO', p.puesto]);
      rows.push(['Dirección', p.direccion, 'DIVIPOLE', divipole]);
      rows.push(['Mesas', p.mesas || 0, 'Votantes', p.total || 0]);
      rows.push(['Estado', tagLabels[ps.tag || 'n'], 'Coordinador', ps.coord || '', 'Teléfono', ps.phone || '']);
      if (cnt > 0) {
        rows.push([]); rows.push(['PREGONEROS', 'Nombre', 'Cédula', 'Responsable', 'Teléfono']);
        for (let i = 0; i < cnt; i++) { const r = pregRows[i] || {}; rows.push([`${i + 1}`, r.nombre || '', r.cedula || '', r.responsable || '', r.telefono || '']); }
      }
      if (testRows.length > 0) {
        rows.push([]); rows.push(['TESTIGOS', 'Nombre', 'Teléfono', '', '']);
        testRows.forEach((r, i) => rows.push([`${i + 1}`, r.nombre || '', r.telefono || '', '', '']));
      }
      rows.push([]);
    });
    return rows;
  }
  if (tipo === 'all') {
    AMVA.forEach(n => {
      if (!RAW[n]) return; const s = gs(n); const allRows = [];
      allRows.push([n === 'MEDELLIN' ? 'MEDELLÍN' : n]);
      allRows.push(['Coordinador municipal', s.coord || '', 'Teléfono', s.phone || '']);
      allRows.push([]);
      Object.keys(RAW[n]).sort().forEach(ck => sheetForComuna(n, ck).forEach(r => allRows.push(r)));
      const ws = XLSX.utils.aoa_to_sheet(allRows);
      ws['!cols'] = [{ wch: 28 }, { wch: 35 }, { wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, (n === 'MEDELLIN' ? 'MEDELLIN' : n).substring(0, 31));
    });
    XLSX.writeFile(wb, 'Comando_Electoral_AMVA_2026.xlsx');
  } else if (tipo === 'medellin') {
    const s = gs('MEDELLIN'); const allRows = [];
    allRows.push(['MEDELLÍN']); allRows.push(['Coordinador municipal', s.coord || '', 'Teléfono', s.phone || '']); allRows.push([]);
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => sheetForComuna('MEDELLIN', ck).forEach(r => allRows.push(r)));
    const ws = XLSX.utils.aoa_to_sheet(allRows); ws['!cols'] = [{ wch: 28 }, { wch: 35 }, { wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'MEDELLÍN');
    XLSX.writeFile(wb, 'Comando_Electoral_Medellin_2026.xlsx');
  } else if (tipo === 'comuna') {
    const rows = sheetForComuna(muni, ck);
    const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 28 }, { wch: 35 }, { wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, ck.substring(0, 31));
    XLSX.writeFile(wb, 'Comando_' + ck.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40) + '.xlsx');
  } else if (tipo === 'muni') {
    const s = gs(muni); const allRows = [];
    allRows.push([muni]); allRows.push(['Coordinador municipal', s.coord || '', 'Teléfono', s.phone || '']); allRows.push([]);
    Object.keys(RAW[muni]).sort().forEach(ck => sheetForComuna(muni, ck).forEach(r => allRows.push(r)));
    const ws = XLSX.utils.aoa_to_sheet(allRows); ws['!cols'] = [{ wch: 28 }, { wch: 35 }, { wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, muni.substring(0, 31));
    XLSX.writeFile(wb, 'Comando_Electoral_' + muni + '_2026.xlsx');
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
    const pregBase = PREG_BASE[n]?.[comunaKey] || {};
    const mov = s.movilidad?.[comunaKey] || {};
    const respsP = (mov.responsables || []);
    let puestosHTML = '';
    puestos.forEach(p => {
      const k = pk(p); const ps = (s.puestos || {})[k] || {};
      const pregRows = (s.pregoneros?.[comunaKey]?.[p.puesto]) || [];
      const testRows = (s.testigos?.[comunaKey]?.[p.puesto]) || [];
      const savedCnts = (s.pregoneros?.[comunaKey]?._counts) || {};
      const baseCnt = pregBase[p.puesto] !== undefined ? pregBase[p.puesto] : 0;
      const cnt = savedCnts[p.puesto] !== undefined ? savedCnts[p.puesto] : baseCnt;
      let pregHTML = '';
      if (cnt > 0 || pregRows.filter(r => r.nombre).length > 0) {
        const filled = pregRows.filter(r => r.nombre);
        pregHTML = `<div style="margin-top:6px"><b style="font-size:11px;color:#6b4ed6">Pregoneros (${filled.length}/${cnt}):</b>
          <table style="width:100%;font-size:10px;border-collapse:collapse;margin-top:3px">
            <tr style="background:#f0eeff"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Nombre</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Cédula</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Responsable</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Teléfono</th></tr>
            ${Array.from({ length: cnt }, (_, i) => { const r = pregRows[i] || {}; return `<tr><td style="padding:3px 6px;border:1px solid #ddd">${r.nombre || ''}</td><td style="padding:3px 6px;border:1px solid #ddd">${r.cedula || ''}</td><td style="padding:3px 6px;border:1px solid #ddd">${r.responsable || ''}</td><td style="padding:3px 6px;border:1px solid #ddd">${r.telefono || ''}</td></tr>`; }).join('')}
          </table></div>`;
      }
      let testHTML = '';
      if (testRows.length > 0) {
        testHTML = `<div style="margin-top:6px"><b style="font-size:11px;color:#1a8f4a">Testigos (${testRows.filter(r => r.nombre).length}):</b>
          <table style="width:100%;font-size:10px;border-collapse:collapse;margin-top:3px">
            <tr style="background:#efffef"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Nombre</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Teléfono</th></tr>
            ${testRows.map(r => `<tr><td style="padding:3px 6px;border:1px solid #ddd">${r.nombre || ''}</td><td style="padding:3px 6px;border:1px solid #ddd">${r.telefono || ''}</td></tr>`).join('')}
          </table></div>`;
      }
      const tagLabels = { n: 'Sin estado', ok: '✓ Cubierto', pr: '★ Prioritario', pe: '⏳ Pendiente', al: '⚠ Alerta' };
      puestosHTML += `<div style="margin-bottom:12px;padding:10px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div><b style="font-size:12px">${p.puesto}</b><div style="font-size:10px;color:#666">${p.direccion}</div></div>
          <div style="text-align:right;font-size:10px">
            <div>${p.mesas || 0} mesas · ${(p.total || 0).toLocaleString('es-CO')} votantes</div>
            <div style="color:#888">${tagLabels[ps.tag || 'n']}</div>
            ${ps.coord ? `<div style="color:#1a6fd4">👤 ${ps.coord}${ps.phone ? ' · ' + ps.phone : ''}</div>` : ''}
          </div>
        </div>${pregHTML}${testHTML}</div>`;
    });
    const movHTML = respsP.length ? `<div style="margin-top:8px;padding:8px;background:#fff8e6;border:1px solid #f5c842;border-radius:6px;font-size:11px">
      <b>Movilidad:</b>
      <table style="font-size:10px;border-collapse:collapse;width:100%;margin-top:4px"><tr style="background:#f0f0f0"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Responsable</th><th style="padding:3px 6px;border:1px solid #ddd">Teléfono</th><th style="padding:3px 6px;border:1px solid #ddd">🏍</th><th style="padding:3px 6px;border:1px solid #ddd">🚗</th></tr>
      ${respsP.map(r => `<tr><td style="padding:3px 6px;border:1px solid #ddd">${r.nombre || ''}</td><td style="padding:3px 6px;border:1px solid #ddd">${r.telefono || ''}</td><td style="padding:3px 6px;border:1px solid #ddd;text-align:center">${r.motos || 0}</td><td style="padding:3px 6px;border:1px solid #ddd;text-align:center">${r.carros || 0}</td></tr>`).join('')}
      </table></div>` : '';
    return `<div style="margin-bottom:24px;page-break-inside:avoid">
      <div style="background:#1a2030;color:#f5c842;padding:10px 14px;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:14px">${comunaKey}</b>
        <span style="font-size:11px;color:#aaa">Coord. zona: ${sc.coord || '—'}${sc.phone ? ' · ' + sc.phone : ''}</span>
      </div>${movHTML}<div style="margin-top:10px">${puestosHTML}</div></div>`;
  }
  if (tipo === 'all') {
    title = 'Reporte Completo — Área Metropolitana Valle de Aburrá';
    AMVA.forEach(n => {
      if (!RAW[n]) return; const s = gs(n);
      sections += `<div style="page-break-before:always;padding-top:16px">
        <h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${n === 'MEDELLIN' ? 'MEDELLÍN' : n} — Coordinador: ${s.coord || 'Sin asignar'}${s.phone ? ' · ' + s.phone : ''}</h2>
        ${Object.keys(RAW[n]).sort().map(ck => sectionForComuna(n, ck)).join('')}</div>`;
    });
  } else if (tipo === 'comuna') {
    const s = gs(muni); title = `Reporte — MEDELLÍN · ${ck}`; sections = sectionForComuna(muni, ck);
  } else {
    const s = gs(muni); title = `Reporte — ${muni}`;
    sections = `<div><h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${muni} — Coordinador: ${s.coord || 'Sin asignar'}${s.phone ? ' · ' + s.phone : ''}</h2>
      ${Object.keys(RAW[muni]).sort().map(comunaKey => sectionForComuna(muni, comunaKey)).join('')}</div>`;
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:20px}h1{font-size:18px;color:#1a2030;margin-bottom:4px}.meta{font-size:11px;color:#666;margin-bottom:24px}@media print{body{padding:10px}}</style>
  </head><body><h1>⚡ ${title}</h1><div class="meta">Generado: ${now} · Comando Electoral AMVA 2026</div>${sections}</body></html>`;
}
