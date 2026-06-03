/* ============================================================================
 * resultados-votacion.js
 * Mapa "Resultados Votación" (semáforo electoral) embebido NATIVAMENTE en el
 * app de Coordinación Electoral, renderizado con **Leaflet** (la misma librería
 * del mapa de Coordinación). No usa WebGL — funciona en cualquier equipo donde
 * ya corre la app.
 *
 * API pública:
 *   ResultadosVotacion.mount(container, { municipio?, dataBase? })
 *   ResultadosVotacion.unmount()
 *
 * Datos estáticos en: resultados-votacion/{municipios,comunas_medellin,
 * puestos}.geojson + mesas.json. No toca el backend.
 * ========================================================================== */
(function () {
  'use strict';

  var DEFAULT_BASE = 'resultados-votacion/';
  var _DATA = null;            // cache compartido {muni, comunas, puestos, mesas}
  var _puestoIndex = null;     // índice normalize("municipio|puesto") -> props electorales del puesto
  var _loadingPromise = null;
  var _active = null;          // vista activa única { destroy }

  var COLORS = { verde: '#2e7d32', amarillo: '#f9a825', rojo: '#c62828', gris: '#9e9e9e' };
  var MEDELLIN_DANE = '05001';

  var TEMPLATE =
    '<div class="rv-map"></div>' +
    '<div class="rv-control rv-card">' +
      '<h1>Resultados Votación</h1>' +
      '<p class="rv-sub">Antioquia · semáforo de Abelardo de la Espriella</p>' +
      '<div class="rv-row">' +
        '<button class="rv-fsbtn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>' +
        '<button class="rv-back" disabled>← Volver</button>' +
        '<div class="rv-crumbs"></div>' +
      '</div>' +
      '<div class="rv-unit">' +
        '<div class="rv-uname"></div>' +
        '<div class="rv-chips rv-unit-chips"></div>' +
        '<div class="rv-metrics rv-unit-metrics"></div>' +
        '<div class="rv-hint rv-unit-hint"></div>' +
      '</div>' +
    '</div>' +
    '<div class="rv-legend rv-card">' +
      '<div class="rv-lt">Semáforo (puesto de Abelardo)</div>' +
      '<div class="rv-li"><span class="rv-dot" style="background:var(--verde)"></span> 🟢 1° — gana</div>' +
      '<div class="rv-li"><span class="rv-dot" style="background:var(--amarillo)"></span> 🟡 2° lugar</div>' +
      '<div class="rv-li"><span class="rv-dot" style="background:var(--rojo)"></span> 🔴 3° o más</div>' +
      '<div class="rv-li"><span class="rv-dot" style="background:var(--gris)"></span> ⚪ sin datos</div>' +
    '</div>' +
    '<div class="rv-mesas rv-card">' +
      '<div class="rv-mhead">' +
        '<button class="rv-mclose" title="Cerrar">×</button>' +
        '<div class="rv-ptitle">Puesto</div>' +
        '<div class="rv-paddr"></div>' +
        '<div class="rv-msum"></div>' +
        '<div class="rv-mtop"></div>' +
      '</div>' +
      '<div class="rv-mscroll"></div>' +
    '</div>' +
    '<div class="rv-loading">Cargando…</div>';

  // ── helpers de formato ────────────────────────────────────────────────────
  function fmt(n) { return (n == null ? '—' : Number(n).toLocaleString('es-CO')); }
  function pctFmt(p) { return (p == null ? '—' : (Number(p) * 100).toFixed(1).replace('.', ',') + '%'); }
  function semLabel(sem, rank) {
    if (sem === 'verde') return '🟢 1°';
    if (sem === 'amarillo') return '🟡 2°';
    if (sem === 'rojo') return '🔴 ' + (rank ? rank + '°' : '3°+');
    return '⚪ sin datos';
  }
  function semDot(sem) { return '<span class="rv-dot" style="background:' + (COLORS[sem] || COLORS.gris) + '"></span>'; }
  function normalize(s) {
    return (s == null ? '' : String(s)).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── carga de datos (cache compartido) ─────────────────────────────────────
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }
  function loadData(base) {
    if (_DATA) return Promise.resolve(_DATA);
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = Promise.all([
      getJSON(base + 'municipios.geojson'),
      getJSON(base + 'comunas_medellin.geojson'),
      getJSON(base + 'puestos.geojson'),
      getJSON(base + 'mesas.json')
    ]).then(function (a) {
      _DATA = { muni: a[0], comunas: a[1], puestos: a[2], mesas: a[3] };
      _puestoIndex = {};
      _DATA.puestos.features.forEach(function (f) {
        var pr = f.properties;
        _puestoIndex[normalize(pr.municipio) + '|' + normalize(pr.puesto)] = pr;
      });
      return _DATA;
    }).catch(function (err) {
      _loadingPromise = null;  // libera el lock para permitir reintentar en un mount() posterior
      throw err;               // re-lanza para que mount() muestre el panel de error
    });
    return _loadingPromise;
  }

  function findMuniByName(name) {
    var nn = normalize(name), ns = nn.replace(/ /g, '');
    var feats = _DATA.muni.features, i;
    for (i = 0; i < feats.length; i++) if (normalize(feats[i].properties.municipio) === nn) return feats[i];
    for (i = 0; i < feats.length; i++) if (normalize(feats[i].properties.municipio).replace(/ /g, '') === ns) return feats[i];
    return null;
  }

  // ── vista: una instancia de mapa Leaflet montada en `root` ────────────────
  function createView(root, opts) {
    root.classList.add('rv-root');
    root.innerHTML = TEMPLATE;
    var $ = function (sel) { return root.querySelector(sel); };

    var DATA = _DATA;
    var state = { level: 'antioquia', muni: null, comuna: null, fromComuna: false };

    var map;
    try {
      map = L.map($('.rv-map'), { zoomControl: false, attributionControl: true, preferCanvas: true })
        .setView([6.6, -75.6], 7);
    } catch (e) {
      root.innerHTML = '<div class="rv-loading">No se pudo iniciar el mapa: ' + ((e && e.message) || e) + '</div>';
      return { destroy: function () {} };
    }
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap, © CARTO'
    }).addTo(map);

    var muniLayer = null, comunaLayer = null, puestoLayer = null, selLayer = null;

    function fitTo(bounds) {
      if (bounds && bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds, { paddingTopLeft: [40, 28], paddingBottomRight: [40, 28], maxZoom: 15 });
      }
    }
    function polyStyle(p) {
      return { fillColor: COLORS[p.semaforo] || COLORS.gris, fillOpacity: 0.62, weight: 0.8, color: '#ffffff' };
    }
    function onPolyFeature(kind) {
      return function (feature, layer) {
        layer.bindTooltip(tooltipHTML(feature.properties, kind), { sticky: true, direction: 'top', className: 'rv-ltip', opacity: 1 });
        layer.on('mouseover', function () { layer.setStyle({ fillOpacity: 0.85, weight: 1.4 }); });
        layer.on('mouseout', function () { layer.setStyle({ fillOpacity: 0.62, weight: 0.8 }); });
        layer.on('click', function () {
          if (kind === 'muni') enterMunicipio(feature.properties);
          else enterComuna(feature.properties);
        });
      };
    }
    function getMuniLayer() {
      if (!muniLayer) muniLayer = L.geoJSON(DATA.muni, { style: function (f) { return polyStyle(f.properties); }, onEachFeature: onPolyFeature('muni') });
      return muniLayer;
    }
    function getComunaLayer() {
      if (!comunaLayer) comunaLayer = L.geoJSON(DATA.comunas, { style: function (f) { return polyStyle(f.properties); }, onEachFeature: onPolyFeature('comuna') });
      return comunaLayer;
    }
    function clearDynamic() {
      [muniLayer, comunaLayer, puestoLayer, selLayer].forEach(function (l) { if (l && map.hasLayer(l)) map.removeLayer(l); });
    }
    function showPuestos(filterFn) {
      if (puestoLayer) { map.removeLayer(puestoLayer); puestoLayer = null; }
      var markers = [];
      DATA.puestos.features.forEach(function (f) {
        var p = f.properties;
        if (!filterFn(p)) return;
        var c = f.geometry.coordinates;
        var mk = L.circleMarker([c[1], c[0]], { radius: 6, fillColor: COLORS[p.semaforo] || COLORS.gris, color: '#fff', weight: 1.3, opacity: 1, fillOpacity: 0.95 });
        mk.bindTooltip(tooltipHTML(p, 'puesto'), { sticky: true, direction: 'top', className: 'rv-ltip', opacity: 1 });
        mk.on('click', function () { selectPuesto(p); });
        markers.push(mk);
      });
      puestoLayer = L.layerGroup(markers).addTo(map);
    }
    function showSel(feature) {
      if (selLayer) { map.removeLayer(selLayer); selLayer = null; }
      selLayer = L.geoJSON(feature, { style: { color: '#0f172a', weight: 2.4, fill: false }, interactive: false }).addTo(map);
    }
    function boundsOf(feature) { return L.geoJSON(feature).getBounds(); }

    function tooltipHTML(p, kind) {
      if (kind === 'puesto') {
        return '<div class="rv-tt"><div class="rv-ttn">' + p.puesto + '</div>' +
          '<div>' + semDot(p.semaforo) + ' ' + semLabel(p.semaforo, p.rank) + '</div>' +
          '<div>Abelardo <b>' + fmt(p.votos_abelardo) + '</b> · válidos <b>' + fmt(p.total_validos) + '</b> · <b>' + pctFmt(p.pct_abelardo) + '</b></div>' +
          '<div class="rv-ttr">' + (p.direccion || '') + '</div></div>';
      }
      var name = p.municipio || (p.identificacion ? (p.identificacion + ' · ' + p.nombre) : p.nombre);
      var verPuestos = '<div class="rv-ttr">Clic para ver puestos</div>';
      var extra = p.es_medellin ? '<div class="rv-ttr">Clic para ver comunas</div>' :
        (kind === 'muni' ? verPuestos : (p.sin_datos ? '<div class="rv-ttr">Sin puestos en los resultados</div>' : verPuestos));
      return '<div class="rv-tt"><div class="rv-ttn">' + name + '</div>' +
        '<div>' + semDot(p.semaforo) + ' ' + semLabel(p.semaforo, p.rank) + '</div>' +
        '<div>Abelardo <b>' + fmt(p.votos_abelardo) + '</b> · válidos <b>' + fmt(p.total_validos) + '</b> · <b>' + pctFmt(p.pct_abelardo) + '</b></div>' + extra + '</div>';
    }

    // ── navegación ────────────────────────────────────────────────────────────
    function findMuni(dane) { return DATA.muni.features.find(function (f) { return f.properties.cod_dane === dane; }); }
    function findComuna(cod) { return DATA.comunas.features.find(function (f) { return f.properties.codigo === cod; }); }

    function goAntioquia() {
      state.level = 'antioquia'; state.muni = null; state.comuna = null; state.fromComuna = false;
      clearDynamic();
      getMuniLayer().addTo(map);
      closeMesas(); renderCrumbs(); hideUnit();
      fitTo(muniLayer.getBounds());
    }
    function enterMunicipio(p) {
      if (p.cod_dane === MEDELLIN_DANE) { goComunas(); return; }
      state.level = 'puestos'; state.muni = p; state.comuna = null; state.fromComuna = false;
      clearDynamic();
      var mf = findMuni(p.cod_dane);
      if (mf) showSel(mf);
      showPuestos(function (pp) { return pp.cod_dane === p.cod_dane; });
      closeMesas(); renderCrumbs(); showUnit(p, 'municipio');
      if (mf) fitTo(boundsOf(mf));
    }
    function goComunas() {
      var med = findMuni(MEDELLIN_DANE);
      state.level = 'comunas'; state.muni = med ? med.properties : null; state.comuna = null; state.fromComuna = false;
      clearDynamic();
      if (med) showSel(med);
      getComunaLayer().addTo(map);
      showPuestos(function (pp) { return pp.cod_dane === MEDELLIN_DANE && pp.cod_comuna === '00'; });
      closeMesas(); renderCrumbs(); if (state.muni) showUnit(state.muni, 'medellin');
      if (med) fitTo(boundsOf(med));
    }
    function enterComuna(p) {
      state.level = 'puestos'; state.comuna = p; state.fromComuna = true;
      clearDynamic();
      var cf = findComuna(p.codigo);
      if (cf) showSel(cf);
      showPuestos(function (pp) { return pp.cod_dane === MEDELLIN_DANE && pp.cod_comuna === p.codigo; });
      closeMesas(); renderCrumbs(); showUnit(p, 'comuna');
      if (cf) fitTo(boundsOf(cf));
    }
    function selectPuesto(p) { openMesas(p); renderCrumbs(); }
    function back() {
      if (state.level === 'puestos') { if (state.fromComuna) goComunas(); else goAntioquia(); }
      else if (state.level === 'comunas') { goAntioquia(); }
    }

    function renderCrumbs() {
      var el = $('.rv-crumbs'); var parts = [];
      var crumb = function (label, fn, cur) { return cur ? '<span class="rv-current">' + label + '</span>' : '<a class="rv-crumb" data-act="' + fn + '">' + label + '</a>'; };
      parts.push(crumb('Antioquia', 'antioquia', state.level === 'antioquia'));
      if (state.muni) {
        parts.push('<span class="rv-sep">›</span>');
        var isMed = state.muni.cod_dane === MEDELLIN_DANE;
        var cur = (state.level === 'comunas') || (state.level === 'puestos' && !state.fromComuna);
        parts.push(crumb(state.muni.municipio, isMed ? 'medellin' : 'muni', cur));
      }
      if (state.comuna) {
        parts.push('<span class="rv-sep">›</span>');
        parts.push(crumb(state.comuna.identificacion || state.comuna.nombre, 'comuna', state.level === 'puestos'));
      }
      el.innerHTML = parts.join(' ');
      el.querySelectorAll('.rv-crumb').forEach(function (a) {
        a.addEventListener('click', function () {
          var act = a.dataset.act;
          if (act === 'antioquia') goAntioquia();
          else if (act === 'medellin') goComunas();
          else if (act === 'muni') enterMunicipio(state.muni);
          else if (act === 'comuna') enterComuna(state.comuna);
        });
      });
      $('.rv-back').disabled = (state.level === 'antioquia');
    }

    function showUnit(p, kind) {
      var box = $('.rv-unit'); box.style.display = 'block';
      var name = p.municipio || (p.identificacion ? (p.identificacion + ' · ' + p.nombre) : p.nombre);
      $('.rv-uname').textContent = name;
      $('.rv-unit-chips').innerHTML = '<span class="rv-chip">' + semDot(p.semaforo) + ' ' + semLabel(p.semaforo, p.rank) + '</span>';
      $('.rv-unit-metrics').innerHTML =
        '<div>Votos Abelardo</div><div><b>' + fmt(p.votos_abelardo) + '</b></div>' +
        '<div>Total válidos</div><div><b>' + fmt(p.total_validos) + '</b></div>' +
        '<div>% Abelardo</div><div><b>' + pctFmt(p.pct_abelardo) + '</b></div>';
      var hint = '';
      if (kind === 'medellin') hint = 'Clic en una comuna/corregimiento para ver sus puestos. Los puntos grises son puestos especiales sin comuna.';
      else if (kind === 'municipio' || kind === 'comuna') hint = 'Clic en un puesto (punto) para ver sus mesas.';
      if (p.sin_datos) hint = 'Sin puestos en los resultados.';
      $('.rv-unit-hint').textContent = hint;
    }
    function hideUnit() { $('.rv-unit').style.display = 'none'; }

    // ── panel de mesas con TOP-4 ──────────────────────────────────────────────
    function topBlock(top, total, abeRank, abeVotos, title) {
      var CAND = DATA.mesas.cand, ABEIDX = DATA.mesas.abelardoIdx;
      var inTop = top.some(function (pair) { return pair[0] === ABEIDX; });
      var rows = top.map(function (pair, k) {
        var i = pair[0], v = pair[1], isAbe = i === ABEIDX;
        return '<div class="rv-t4r' + (isAbe ? ' rv-abe' : '') + '"><span class="rv-pos">' + (k + 1) + '</span>' +
          '<span class="rv-nm">' + CAND[i] + '</span><span class="rv-vt">' + fmt(v) + '</span>' +
          '<span class="rv-pc">' + pctFmt(total ? v / total : 0) + '</span></div>';
      }).join('');
      if (!inTop && abeRank != null) {
        rows += '<div class="rv-t4r rv-abe rv-fuera"><span class="rv-pos">' + abeRank + 'º</span>' +
          '<span class="rv-nm">' + CAND[ABEIDX] + '</span><span class="rv-vt">' + fmt(abeVotos) + '</span>' +
          '<span class="rv-pc">' + pctFmt(total ? abeVotos / total : 0) + '</span></div>';
      }
      return '<div class="rv-top4"><div class="rv-t4h">' + title + '</div>' + rows + '</div>';
    }
    function openMesas(p) {
      var rec = (DATA.mesas.puestos || {})[p.id_puesto];
      $('.rv-ptitle').textContent = p.puesto;
      $('.rv-paddr').textContent = [p.municipio, p.direccion].filter(Boolean).join(' · ');
      $('.rv-msum').innerHTML =
        '<span class="rv-chip">' + semDot(p.semaforo) + ' ' + semLabel(p.semaforo, p.rank) + '</span>' +
        '<span class="rv-chip">Abelardo <b>' + fmt(p.votos_abelardo) + '</b></span>' +
        '<span class="rv-chip">Válidos <b>' + fmt(p.total_validos) + '</b></span>' +
        '<span class="rv-chip"><b>' + pctFmt(p.pct_abelardo) + '</b></span>';
      var mTop = $('.rv-mtop'), sc = $('.rv-mscroll');
      if (!rec || !rec.mesas || !rec.mesas.length) {
        mTop.innerHTML = ''; sc.innerHTML = '<div class="rv-empty">Este puesto no tiene mesas en los resultados.</div>';
        $('.rv-mesas').classList.add('rv-open'); return;
      }
      mTop.innerHTML = topBlock(rec.top, rec.totalValidos, rec.abeRank, rec.votosAbelardo, 'Top 4 del puesto');
      var mesas = rec.mesas.slice().sort(function (a, b) { return a.mesa - b.mesa; });
      var h = '<table class="rv-mesatab"><thead><tr><th>Mesa</th><th>Sem.</th><th>Abelardo</th><th>Válidos</th><th>%</th><th></th></tr></thead><tbody>';
      mesas.forEach(function (r, idx) {
        var pct = r.tot ? r.abe / r.tot : 0;
        h += '<tr class="rv-mrow" data-i="' + idx + '">' +
          '<td>Mesa ' + r.mesa + '</td>' +
          '<td><span class="rv-semcell">' + semDot(r.sem) + ' ' + semLabel(r.sem, r.rank) + '</span></td>' +
          '<td>' + fmt(r.abe) + '</td><td>' + fmt(r.tot) + '</td><td>' + pctFmt(pct) + '</td>' +
          '<td class="rv-chev">▸</td></tr>' +
          '<tr class="rv-mdet" data-d="' + idx + '" style="display:none"><td colspan="6"></td></tr>';
      });
      h += '</tbody></table>';
      sc.innerHTML = h;
      sc.querySelectorAll('tr.rv-mrow').forEach(function (tr) {
        tr.addEventListener('click', function () {
          var i = +tr.dataset.i;
          var det = sc.querySelector('tr.rv-mdet[data-d="' + i + '"]');
          var chev = tr.querySelector('.rv-chev');
          if (det.style.display !== 'none') { det.style.display = 'none'; tr.classList.remove('rv-open'); chev.textContent = '▸'; }
          else {
            var r = mesas[i];
            det.firstElementChild.innerHTML = topBlock(r.top, r.tot, r.rank, r.abe, 'Top 4 · Mesa ' + r.mesa);
            det.style.display = ''; tr.classList.add('rv-open'); chev.textContent = '▾';
          }
        });
      });
      $('.rv-mesas').classList.add('rv-open');
    }
    function closeMesas() { $('.rv-mesas').classList.remove('rv-open'); }

    // ── wiring de controles + arranque ────────────────────────────────────────
    $('.rv-back').addEventListener('click', back);
    $('.rv-mclose').addEventListener('click', closeMesas);

    // ── pantalla completa (Fullscreen API + fallback CSS) ─────────────────────
    var _fsSupported = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    function _setFsBtn(on) {
      var b = $('.rv-fsbtn');
      if (b) { b.innerHTML = on ? '⤡' : '⛶'; b.title = on ? 'Salir de pantalla completa' : 'Pantalla completa'; }
    }
    function _fsResize() { setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 130); }
    function _cssMax(on) { root.classList.toggle('rv-maximized', on); _setFsBtn(on); _fsResize(); }
    function _isApiFs() { return (document.fullscreenElement || document.webkitFullscreenElement) === root; }
    function _toggleFs() {
      if (_fsSupported) {
        if (_isApiFs()) {
          var ex = document.exitFullscreen || document.webkitExitFullscreen;
          if (ex) { try { ex.call(document); } catch (e) {} }
        } else {
          try {
            var p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
            if (p && p.catch) p.catch(function () { _cssMax(!root.classList.contains('rv-maximized')); });
          } catch (e) { _cssMax(!root.classList.contains('rv-maximized')); }
        }
      } else { _cssMax(!root.classList.contains('rv-maximized')); }
    }
    function _onFsChange() { var on = _isApiFs(); root.classList.toggle('rv-maximized', on); _setFsBtn(on); _fsResize(); }
    function _onKey(e) { if (e.key === 'Escape' && root.classList.contains('rv-maximized') && !(document.fullscreenElement || document.webkitFullscreenElement)) _cssMax(false); }
    $('.rv-fsbtn').addEventListener('click', _toggleFs);
    document.addEventListener('fullscreenchange', _onFsChange);
    document.addEventListener('webkitfullscreenchange', _onFsChange);
    document.addEventListener('keydown', _onKey);

    var entered = false;
    if (opts && opts.comunaCodigo) {
      var cf0 = findComuna(opts.comunaCodigo);
      if (cf0) { var med0 = findMuni(MEDELLIN_DANE); if (med0) state.muni = med0.properties; enterComuna(cf0.properties); entered = true; }
    }
    if (!entered && opts && opts.municipio) {
      var feat = findMuniByName(opts.municipio);
      if (feat) { enterMunicipio(feat.properties); entered = true; }
    }
    if (!entered) goAntioquia();
    var ld = $('.rv-loading'); if (ld) ld.style.display = 'none';
    // Leaflet necesita recalcular tamaño cuando el contenedor pasó de oculto a visible
    var t1 = setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 150);
    var t2 = setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 500);

    return {
      destroy: function () {
        clearTimeout(t1); clearTimeout(t2);
        document.removeEventListener('fullscreenchange', _onFsChange);
        document.removeEventListener('webkitfullscreenchange', _onFsChange);
        document.removeEventListener('keydown', _onKey);
        if (_isApiFs()) { var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) { try { ex.call(document); } catch (e) {} } }
        root.classList.remove('rv-maximized');
        try { map.remove(); } catch (e) {}
      }
    };
  }

  // ── API pública ────────────────────────────────────────────────────────────
  function mount(container, opts) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;
    opts = opts || {};
    root.classList.add('rv-root');
    if (!window.L) {
      root.innerHTML = '<div class="rv-loading">No se pudo cargar Leaflet (revisa tu conexión).</div>';
      return;
    }
    if (_active) { _active.destroy(); _active = null; }
    root.innerHTML = '<div class="rv-loading">Cargando datos electorales…</div>';
    var base = opts.dataBase || DEFAULT_BASE;
    loadData(base).then(function () {
      if (!root.isConnected) return;
      if (_active) { _active.destroy(); _active = null; }  // evita fuga por doble-montaje concurrente
      _active = createView(root, opts);
    }).catch(function (err) {
      root.innerHTML = '<div class="rv-loading">Error cargando datos electorales: ' + ((err && err.message) || err) + '</div>';
    });
  }

  function unmount() { if (_active) { _active.destroy(); _active = null; } }

  // Para uso desde el mapa de Coordinación: precarga datos y cruza un puesto por nombre.
  function preload(base) { return loadData(base || DEFAULT_BASE); }
  function lookupPuesto(municipio, puesto) {
    if (!_puestoIndex) return null;
    return _puestoIndex[normalize(municipio) + '|' + normalize(puesto)] || null;
  }

  window.ResultadosVotacion = {
    mount: mount, unmount: unmount, preload: preload, lookupPuesto: lookupPuesto,
    isLoaded: function () { return !!_DATA; }
  };
})();
