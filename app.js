/* Acuasmart Rural · lógica de la aplicación
   Pantallas: Predio, Monitoreo, Historial, Alertas y Asistente preventivo.
   Requisitos cubiertos: RF02–RF07 y RNF04 (ver README). */
(function () {
  'use strict';

  var C = window.ACUA_CONFIG;
  var Sim = window.AcuaSim;
  var LS_KEY = 'acuasmart.v1';
  var RANK = { ok: 0, warn: 1, crit: 2 };
  var HERO = { ok: 'ÓPTIMO', warn: 'PRECAUCIÓN', crit: 'RIESGO CRÍTICO' };
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var VERIFY = { od: 'el oxígeno', temp: 'la temperatura', ph: 'el pH', flow: 'el caudal' };
  var NAV_FOR = { asistente: 'historial' };

  var ICONS = {
    od:   '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="3.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="17" cy="17" r="1.8"/></svg>',
    temp: '<svg viewBox="0 0 24 24"><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/></svg>',
    ph:   '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/></svg>',
    flow: '<svg viewBox="0 0 24 24"><path d="M3 8h13a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h8"/></svg>'
  };
  var ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24"><path d="M12 3l10 17H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>';

  var state = {
    profile: null,
    history: [],
    latest: null,
    lastSync: null,
    pending: [],        // lecturas guardadas en el nodo mientras no hay red (Store-and-Forward)
    nodeLast: null,     // última lectura generada por el nodo sin conexión
    online: true,
    hypoxia: false,
    status: {},
    alerts: [],
    maintenance: [],
    activeVar: 'od',
    range: '24h',
    screen: 'predio',
    timer: null,
    toastTimer: null
  };

  /* ---------- Utilidades ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hh(t) { return pad(new Date(t).getHours()); }
  function clock12(t) {
    var d = new Date(t), h = d.getHours(), ap = h >= 12 ? 'p.m.' : 'a.m.';
    h = h % 12 || 12;
    return h + ':' + pad(d.getMinutes()) + ' ' + ap;
  }
  function dayLabel(t) {
    var d = new Date(t);
    var same = d.toDateString() === new Date().toDateString();
    return (same ? 'Hoy, ' : '') + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }
  function shortDate(t) { var d = new Date(t); return d.getDate() + ' ' + MON3[d.getMonth()] + '.'; }
  function fmt(key, v) { return Number(v).toFixed(C.vars[key].decimals); }
  function unitText(key) { return C.vars[key].unit ? ' ' + C.vars[key].unit : ''; }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function inRange(v, r) { return (r[0] == null || v >= r[0]) && (r[1] == null || v <= r[1]); }
  function ranges(key) { return C.species[state.profile.especie].ranges[key]; }
  function statusOf(key, v) {
    var r = ranges(key);
    if (inRange(v, r.ok)) return 'ok';
    if (inRange(v, r.warn)) return 'warn';
    return 'crit';
  }
  function directionOf(key, v) {
    var ok = ranges(key).ok;
    return (ok[0] != null && v < ok[0]) ? 'low' : 'high';
  }
  function worst(map) {
    var w = 'ok';
    Object.keys(map).forEach(function (k) { if (RANK[map[k]] > RANK[w]) w = map[k]; });
    return w;
  }
  function veredaShort() { return (state.profile.vereda || 'Mi predio').split(',')[0].trim(); }
  function openAlerts() { return state.alerts.filter(function (a) { return !a.resolved; }); }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  /* ---------- Persistencia local ---------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        profile: state.profile, alerts: state.alerts, maintenance: state.maintenance
      }));
    } catch (e) { /* sin almacenamiento: la app sigue funcionando */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------- Tendencia de caudal ---------- */
  // Cambio porcentual del caudal actual frente al promedio de los últimos 7 días
  function flowTrend() {
    if (!state.latest) return null;
    var since = Date.now() - 7 * 24 * 3600e3;
    var vals = state.history.filter(function (p) { return p.t >= since; }).map(function (p) { return p.flow; });
    if (!vals.length) return null;
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return Math.round(((state.latest.flow - mean) / mean) * 100);
  }

  /* ---------- Recomendaciones (RF07) ---------- */
  function recommendations(key, dir) {
    var map = {
      od: { low: [['AIREACIÓN', 'Aumentar apertura de compuerta de entrada en 25% por 45 min'],
                  ['MANTENIMIENTO', 'Limpiar sedimentos en rejilla de bocatoma']] },
      temp: {
        high: [['RENOVACIÓN', 'Aumentar el caudal de entrada para renovar el agua'],
               ['MANEJO', 'Dar sombra al estanque y suspender la ración en las horas de calor']],
        low:  [['RECAMBIO', 'Reducir el recambio de agua en las horas más frías'],
               ['FUENTE', 'Revisar que la fuente no entregue agua demasiado fría']]
      },
      ph: {
        low:  [['RECAMBIO', 'Hacer un recambio parcial con la fuente habitual'],
               ['VERIFICACIÓN', 'Medir de nuevo con un equipo patrón antes de actuar']],
        high: [['RECAMBIO', 'Hacer un recambio parcial con la fuente habitual'],
               ['VERIFICACIÓN', 'Medir de nuevo con un equipo patrón antes de actuar']]
      },
      flow: {
        low:  [['BOCATOMA', 'Revisar la bocatoma: puede haber hojas o sedimento'],
               ['MANTENIMIENTO', 'Limpiar la rejilla y comprobar la apertura de la compuerta']],
        high: [['COMPUERTA', 'Reducir la apertura de la compuerta para evitar desbordamientos'],
               ['MANTENIMIENTO', 'Revisar el estanque por arrastre de sólidos tras la lluvia']]
      }
    };
    return (map[key] && map[key][dir]) || [['REVISIÓN', 'Revisar el estanque y verificar la medición']];
  }

  /* ---------- Alertas (RF06) ---------- */
  function evaluate(reading, silent) {
    Object.keys(C.vars).forEach(function (key) {
      var s = statusOf(key, reading[key]);
      var prev = state.status[key] || 'ok';

      if (s !== 'ok' && RANK[s] > RANK[prev]) {
        state.alerts.unshift({
          id: reading.t + '-' + key, t: reading.t, key: key, value: reading[key],
          status: s, dir: directionOf(key, reading[key]), limit: ranges(key).ok, resolved: false
        });
        if (state.alerts.length > C.maxAlerts) state.alerts.length = C.maxAlerts;
        if (!silent) toast((s === 'crit' ? 'Alerta crítica: ' : 'Precaución: ') + C.vars[key].label.toLowerCase());
      }
      if (s === 'ok' && prev !== 'ok') {
        state.alerts.forEach(function (a) { if (a.key === key) a.resolved = true; });
      }
      state.status[key] = s;
    });
    save();
  }

  /* ---------- Flujo de lecturas ---------- */
  function accept(reading, silent) {
    state.history.push(reading);
    if (state.history.length > C.maxHistoryPoints) state.history.shift();
    state.latest = reading;
    state.lastSync = reading.t;
    evaluate(reading, silent);
  }

  function tick() {
    if (!state.profile) return;
    var from = (!state.online && state.nodeLast) ? state.nodeLast : state.latest;
    var reading = Sim.next(from, state.profile.especie, state.hypoxia);
    if (state.online) {
      accept(reading, false);
    } else {
      // Sin red: el nodo guarda localmente con sello de tiempo (RF02)
      state.pending.push(reading);
      state.nodeLast = reading;
    }
    renderAll();
  }

  function setOnline(on) {
    if (state.online === on) return;
    state.online = on;
    if (on) {
      var queue = state.pending.slice();
      state.pending = [];
      state.nodeLast = null;
      queue.forEach(function (r) { accept(r, true); });
      toast(queue.length ? 'Sincronizado: ' + queue.length + ' lecturas enviadas a la nube' : 'Conexión restablecida');
    } else {
      toast('Sin señal: el nodo guarda las lecturas');
    }
    renderAll();
  }

  /* ---------- Render: común ---------- */
  function renderChrome() {
    var net = $('#netBadge');
    net.textContent = state.online ? '4G' : 'Sin señal';
    net.className = 'net ' + (state.online ? 'net--on' : 'net--off');

    var banner = $('#offlineBanner');
    banner.hidden = state.online;
    if (!state.online) {
      banner.textContent = 'Sin conexión. Mostrando el último dato sincronizado a las ' + clock12(state.lastSync || Date.now()) + '.';
    }

    var n = openAlerts().length;
    var badge = $('#navBadge');
    badge.hidden = n === 0;
    badge.textContent = n;
  }

  /* ---------- Render: Monitoreo ---------- */
  function pillFor(key, v) {
    var s = statusOf(key, v);
    if (s !== 'ok') {
      var low = directionOf(key, v) === 'low';
      return { cls: s, text: (low ? 'Bajo' : 'Alto') + (s === 'crit' ? ' · crítico' : '') };
    }
    if (key === 'flow') {
      var t = flowTrend();
      if (t != null && t <= -C.flowTrendThreshold) return { cls: 'warn', text: '↘ ' + t + '% Flujo' };
      if (t != null && t >= C.flowTrendThreshold) return { cls: 'warn', text: '↗ +' + t + '% Flujo' };
    }
    var labels = { od: 'Óptimo', temp: 'Estable', ph: (v >= 6.8 && v <= 7.6) ? 'Neutro' : 'Normal', flow: 'Estable' };
    return { cls: 'ok', text: '✓ ' + labels[key] };
  }

  function agoText(t) {
    var m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'hace menos de 1 min' : 'hace ' + m + ' min';
  }

  function renderMonitoreo() {
    if (!state.latest || !state.profile) return;

    $('#monSub').textContent = veredaShort() + ' · ' + C.species[state.profile.especie].name;

    var overall = worst(state.status);
    var hero = $('#overall');
    hero.dataset.status = overall;
    $('#heroLabel').innerHTML = (overall === 'ok' ? ICON_CHECK : ICON_ALERT) + '<span>Estado del Estanque:</span>';
    $('#heroState').textContent = HERO[overall];
    $('#syncInfo').textContent = state.online
      ? 'Última lectura ' + agoText(state.lastSync)
      : 'Sin conexión desde las ' + clock12(state.lastSync);

    var badge = $('#monBadge');
    badge.dataset.status = overall;
    badge.innerHTML = overall === 'ok' ? ICON_CHECK : ICON_ALERT;

    var wrap = $('#cards');
    wrap.textContent = '';
    Object.keys(C.vars).forEach(function (key) {
      var v = state.latest[key];
      var pill = pillFor(key, v);
      var card = el('div', 'metric');
      card.dataset.status = statusOf(key, v);

      var head = el('div', 'metric__head');
      head.innerHTML = ICONS[key];
      head.appendChild(el('span', 'metric__name', C.vars[key].card));
      card.appendChild(head);

      var val = el('div', 'metric__value', fmt(key, v));
      if (C.vars[key].unit) val.appendChild(el('span', 'metric__unit', C.vars[key].unit));
      card.appendChild(val);

      card.appendChild(el('span', 'pill pill--' + pill.cls, pill.text));
      wrap.appendChild(card);
    });

    renderTip();

    $('#pendingInfo').textContent = state.pending.length
      ? 'El nodo tiene ' + state.pending.length + ' lecturas guardadas localmente, pendientes de enviar.' : '';
    $('#btnOffline').textContent = state.online ? 'Simular pérdida de señal' : 'Restablecer conexión';
    $('#btnHypoxia').disabled = state.hypoxia;
  }

  function renderTip() {
    var tip = $('#tipCard');
    var open = openAlerts();
    var t = flowTrend();
    var eyebrow = 'SUGERENCIA RÁPIDA', title, text;

    if (open.length) {
      var a = open[0];
      title = 'Atiende la alerta de ' + C.vars[a.key].short.toLowerCase();
      text = 'Abre el Centro de alertas para ver qué hacer ahora.';
    } else if (t != null && t <= -C.flowTrendThreshold) {
      title = 'Revisa la bocatoma';
      text = 'El caudal bajó ' + Math.abs(t) + '%. Verifica si hay hojas o sedimentos en la rejilla.';
    } else {
      title = 'Todo en orden';
      text = 'Las lecturas están en rango. Revisa la rejilla en tu ronda diaria.';
    }
    tip.textContent = '';
    tip.appendChild(el('p', 'tip__eyebrow', eyebrow));
    tip.appendChild(el('p', 'tip__title', title));
    tip.appendChild(el('p', 'tip__text', text));
  }

  /* ---------- Render: Historial (RF05) ---------- */
  var RANGE_MS = { '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 };
  var RANGE_LABEL = { '24h': '24 h', '7d': '7 días', '30d': '30 días' };

  function bucketize(data, t0, t1, n) {
    var size = (t1 - t0) / n, sums = [], counts = [], i;
    for (i = 0; i < n; i++) { sums.push(0); counts.push(0); }
    data.forEach(function (p) {
      var idx = Math.min(n - 1, Math.max(0, Math.floor((p.t - t0) / size)));
      sums[idx] += p.v; counts[idx]++;
    });
    var out = [];
    for (i = 0; i < n; i++) if (counts[i]) out.push({ t: t0 + size * (i + 0.5), v: sums[i] / counts[i] });
    return out;
  }

  function niceTicks(lo, hi, n) {
    var raw = (hi - lo) / n;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / mag;
    var step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  function renderHistorial() {
    if (!state.profile || !state.history.length) return;
    var key = state.activeVar, def = C.vars[key], r = ranges(key);
    var t1 = Date.now(), t0 = t1 - RANGE_MS[state.range];

    var raw = state.history.filter(function (p) { return p.t >= t0; })
      .map(function (p) { return { t: p.t, v: p[key] }; });
    if (!raw.length) return;
    var pts = bucketize(raw, t0, t1, state.range === '24h' ? 48 : 90);

    $('#hisSub').textContent = veredaShort() + ' · Tendencias del estanque';
    $('#chartTitle').textContent = state.range === '24h' ? 'Evolución horaria' : 'Evolución diaria';
    $('#chartSub').textContent = state.range === '24h'
      ? shortDate(t0) + ', ' + hh(t0) + ' h – ' + shortDate(t1) + ', ' + hh(t1) + ' h'
      : shortDate(t0) + ' – ' + shortDate(t1);

    var legend = [];
    if (r.ok[0] != null) legend.push('Umbral mínimo: ' + r.ok[0].toFixed(def.decimals) + unitText(key));
    if (r.ok[1] != null) legend.push('Umbral máximo: ' + r.ok[1].toFixed(def.decimals) + unitText(key));
    $('#chartLegend').textContent = legend.length ? '-- ' + legend.join(' · ') : '';

    // Escalas
    var W = 340, H = 190, L = 38, R = 10, T = 10, B = 26;
    var vals = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (r.ok[0] != null) lo = Math.min(lo, r.ok[0]);
    if (r.ok[1] != null) hi = Math.max(hi, r.ok[1]);
    var pad5 = ((hi - lo) || 1) * 0.08;
    lo -= pad5; hi += pad5;
    function x(t) { return L + ((t - t0) / (t1 - t0)) * (W - L - R); }
    function y(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    function add(tag, attrs, text) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      svg.appendChild(n);
    }

    niceTicks(lo, hi, 3).forEach(function (tv) {
      add('line', { x1: L, x2: W - R, y1: y(tv), y2: y(tv), 'class': 'grid' });
      add('text', { x: L - 6, y: y(tv) + 4, 'text-anchor': 'end' }, tv.toFixed(def.decimals));
    });
    for (var k = 0; k <= 4; k++) {
      var tt = t0 + ((t1 - t0) * k) / 4;
      var label = state.range === '24h' ? hh(tt) + ' h' : shortDate(tt);
      add('text', { x: x(tt), y: H - 8, 'text-anchor': k === 0 ? 'start' : (k === 4 ? 'end' : 'middle') }, label);
    }
    [r.ok[0], r.ok[1]].forEach(function (lim) {
      if (lim != null) add('line', { x1: L, x2: W - R, y1: y(lim), y2: y(lim), 'class': 'limit' });
    });

    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    add('path', { d: d + ' L' + x(last.t).toFixed(1) + ' ' + (H - B) + ' L' + x(pts[0].t).toFixed(1) + ' ' + (H - B) + ' Z', 'class': 'area' });
    add('path', { d: d, 'class': 'line' });
    add('circle', { cx: x(last.t), cy: y(last.v), r: 4.5, 'class': 'dot' });

    var chart = $('#chart');
    chart.textContent = '';
    chart.appendChild(svg);

    // Resumen analítico
    var rv = raw.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, rv), mx = Math.max.apply(null, rv);
    var out = rv.filter(function (v) { return !inRange(v, r.ok); }).length;
    var worstS = 'ok';
    rv.forEach(function (v) { var s = statusOf(key, v); if (RANK[s] > RANK[worstS]) worstS = s; });

    var sum = $('#summary');
    sum.dataset.status = worstS;
    sum.textContent = '';
    sum.appendChild(el('p', 'summary__eyebrow', 'RESUMEN ANALÍTICO'));
    sum.appendChild(el('p', 'summary__title',
      def.short + (worstS === 'ok' ? ' en rango seguro' : worstS === 'warn' ? ' con episodios de precaución' : ' con episodios críticos')));
    sum.appendChild(el('p', 'summary__line summary__line--strong', 'Mín. ' + fmt(key, mn) + ' · Máx. ' + fmt(key, mx) + unitText(key)));
    var fuera = r.ok[1] == null ? 'bajo el umbral' : 'fuera del umbral';
    sum.appendChild(el('p', 'summary__line', out === 0
      ? 'Sin lecturas ' + fuera + ' en ' + RANGE_LABEL[state.range] + '.'
      : Math.round((out / rv.length) * 100) + ' % de las lecturas estuvo ' + fuera + ' en ' + RANGE_LABEL[state.range] + '.'));
  }

  /* ---------- Render: Alertas ---------- */
  function renderAlertas() {
    var open = openAlerts();
    var box = $('#activeAlert');
    box.textContent = '';

    $('#aleSub').textContent = (state.profile ? veredaShort() + ' · ' : '') +
      (open.length ? open.length + (open.length === 1 ? ' alerta por atender' : ' alertas por atender') : 'Sin alertas por atender');

    if (!open.length) {
      var none = el('div', 'alert alert--none');
      none.appendChild(el('p', 'alert__top', 'Todo en orden'));
      none.appendChild(el('p', 'alert__msg', 'Las cuatro variables están dentro del rango normal para tu especie.'));
      box.appendChild(none);
    } else {
      var a = open.slice().sort(function (p, q) { return RANK[q.status] - RANK[p.status] || q.t - p.t; })[0];
      var def = C.vars[a.key];

      var card = el('div', 'alert' + (a.status === 'warn' ? ' alert--warn' : ''));
      var top = el('p', 'alert__top');
      top.innerHTML = ICON_ALERT;
      top.appendChild(el('span', null, a.status === 'crit' ? 'ALERTA CRÍTICA' : 'PRECAUCIÓN'));
      card.appendChild(top);
      card.appendChild(el('p', 'alert__msg', def.label + (a.dir === 'low' ? ' descendió a' : ' subió a')));
      var big = el('p', 'alert__big', fmt(a.key, a.value));
      if (def.unit) big.appendChild(el('span', 'alert__unit', def.unit));
      card.appendChild(big);
      card.appendChild(el('p', 'alert__meta', clock12(a.t) + ' · ' + dayLabel(a.t)));
      card.appendChild(el('p', 'alert__meta', a.dir === 'low'
        ? 'Por debajo del mínimo de ' + a.limit[0].toFixed(def.decimals) + unitText(a.key)
        : 'Por encima del máximo de ' + a.limit[1].toFixed(def.decimals) + unitText(a.key)));
      box.appendChild(card);

      box.appendChild(el('h2', 'section-title', 'Acciones recomendadas'));
      recommendations(a.key, a.dir).forEach(function (rc, i) {
        var rec = el('div', 'rec');
        rec.appendChild(el('p', 'rec__prio', 'PRIORIDAD ' + (i + 1) + ' · ' + rc[0]));
        rec.appendChild(el('p', 'rec__text', (i + 1) + '. ' + rc[1]));
        box.appendChild(rec);
      });
      box.appendChild(el('p', 'foot', 'Verifica ' + VERIFY[a.key] + ' después de actuar.'));
      var go = el('button', 'btn btn--blue', 'Ver monitoreo en tiempo real');
      go.type = 'button';
      go.addEventListener('click', function () { show('monitoreo'); });
      box.appendChild(go);
    }

    var list = $('#alertList');
    list.textContent = '';
    if (!state.alerts.length) list.appendChild(el('li', 'alist__empty', 'Todavía no se han emitido alertas.'));
    state.alerts.forEach(function (a) {
      var def = C.vars[a.key];
      var li = el('li');
      li.dataset.status = a.status;
      li.dataset.resolved = String(a.resolved);
      li.appendChild(el('strong', null, def.label + (a.dir === 'low' ? ' bajo: ' : ' alto: ') + fmt(a.key, a.value) + unitText(a.key)));
      li.appendChild(el('span', null, dayLabel(a.t) + ', ' + clock12(a.t) + ' · ' + (a.status === 'crit' ? 'Crítica' : 'Precaución') + (a.resolved ? ' · Resuelta' : '')));
      list.appendChild(li);
    });
  }

  /* ---------- Render: Asistente preventivo ---------- */
  function renderAsistente() {
    if (!state.profile || !state.latest) return;
    var since = Date.now() - 7 * 24 * 3600e3;
    var week = state.history.filter(function (p) { return p.t >= since; });
    var od = week.map(function (p) { return p.od; });
    var odMin = Math.min.apply(null, od), odMax = Math.max.apply(null, od);
    var odOk = odMin >= (ranges('od').ok[0] == null ? -Infinity : ranges('od').ok[0]);
    var t = flowTrend();
    var trendText = t == null ? 'Estable' : (t <= -5 ? 'Bajó ' + Math.abs(t) + '%' : t >= 5 ? 'Subió ' + t + '%' : 'Estable');

    var an = $('#analysis');
    an.textContent = '';
    an.appendChild(el('p', 'analysis__eyebrow', 'ANÁLISIS · ÚLTIMOS 7 DÍAS'));
    an.appendChild(el('p', 'analysis__title', 'Cuida el agua, prevén fallas'));
    an.appendChild(el('p', 'analysis__line', 'Caudal: ' + fmt('flow', state.latest.flow) + ' L/min · ' + trendText));
    an.appendChild(el('p', 'analysis__line', 'Oxígeno: ' + odMin.toFixed(1) + '–' + odMax.toFixed(1) + ' mg/L · ' + (odOk ? 'En rango' : 'Con episodios bajos')));

    var crit = worst(state.status) === 'crit';
    var needsAction = crit || (t != null && t <= -C.flowTrendThreshold);
    var recambioText = crit
      ? 'Hay una alerta crítica. Sigue primero las acciones del Centro de alertas y luego define el recambio con apoyo técnico.'
      : needsAction
        ? 'Primero limpia la entrada de agua. Si el caudal no mejora, ajusta el recambio con apoyo técnico.'
        : 'El caudal está estable. Mantén el recambio habitual y revisa el oxígeno a primera hora.';

    var steps = $('#steps');
    steps.textContent = '';
    [
      { badge: needsAction ? 'HOY' : 'SEGUIMIENTO', cls: needsAction ? 'warn' : 'ok', title: '1. Recambio de agua', text: recambioText },
      { badge: 'REVISIÓN DIARIA', cls: 'ok', title: '2. Mantenimiento del estanque',
        text: 'Retira hojas de la rejilla y revisa la salida del estanque. Registra la limpieza y vuelve a medir el caudal.' }
    ].forEach(function (s) {
      var card = el('article', 'step');
      card.appendChild(el('p', 'step__badge step__badge--' + s.cls, s.badge));
      card.appendChild(el('h2', 'step__title', s.title));
      card.appendChild(el('p', 'step__text', s.text));
      steps.appendChild(card);
    });

    $('#astFoot').textContent = veredaShort() + ' · ' + C.species[state.profile.especie].name + '. Datos de ejemplo para esta interfaz.';
    var lastLog = state.maintenance[0];
    $('#lastLog').textContent = lastLog ? 'Último registro: ' + dayLabel(lastLog) + ', ' + clock12(lastLog) + '.' : '';
  }

  function renderAll() {
    renderChrome();
    if (!state.profile) return;
    renderMonitoreo();
    if (state.screen === 'historial') renderHistorial();
    if (state.screen === 'alertas') renderAlertas();
    if (state.screen === 'asistente') renderAsistente();
  }

  /* ---------- Navegación ---------- */
  function show(name) {
    if (name !== 'predio' && !state.profile) {
      toast('Primero configura tu estanque');
      name = 'predio';
    }
    state.screen = name;
    $$('.screen').forEach(function (s) { s.hidden = s.id !== 'screen-' + name; });
    var navName = NAV_FOR[name] || name;
    $$('.nav__btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.target === navName); });
    var main = $('main');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    renderAll();
  }

  /* ---------- Sesión de monitoreo ---------- */
  function startSession() {
    state.history = Sim.createHistory(state.profile.especie);
    state.latest = state.history[state.history.length - 1];
    state.lastSync = state.latest.t;
    state.pending = [];
    state.nodeLast = null;
    state.online = true;
    state.hypoxia = false;
    state.status = {};
    Object.keys(C.vars).forEach(function (k) { state.status[k] = statusOf(k, state.latest[k]); });
    clearInterval(state.timer);
    state.timer = setInterval(tick, C.tickMs);
  }

  function bindForm() {
    var form = $('#predioForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#productor').value.trim();
      var vereda = $('#vereda').value.trim();
      var nodo = $('#nodo').value.trim();
      var especie = form.elements.especie.value;
      var err = $('#formError');

      if (!name || !vereda || !nodo) {
        err.textContent = 'Completa el nombre, la vereda y el ID del nodo.';
        err.hidden = false;
        return;
      }
      if (!$('#consent').checked) {
        err.textContent = 'Para continuar, autoriza el tratamiento de tus datos.';
        err.hidden = false;
        return;
      }
      err.hidden = true;

      var changed = !state.profile || state.profile.especie !== especie;
      state.profile = { productor: name, vereda: vereda, especie: especie, nodo: nodo, consent: true };
      if (changed || !state.history.length) {
        state.alerts = [];
        startSession();
      }
      save();
      toast('Estanque guardado');
      show('monitoreo');
    });

    $('#btnPrivacy').addEventListener('click', function () {
      var dlg = $('#privacy');
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  }

  function bindControls() {
    $$('.nav__btn').forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.target); });
    });

    var sel = $('#varSelect');
    Object.keys(C.vars).forEach(function (k) {
      var o = el('option', null, C.vars[k].label + (C.vars[k].unit ? ' ' + C.vars[k].unit : ''));
      o.value = k;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.activeVar = sel.value; renderHistorial(); });

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.range = t.dataset.range;
        $$('.tab').forEach(function (x) {
          x.classList.toggle('is-active', x === t);
          x.setAttribute('aria-selected', x === t ? 'true' : 'false');
        });
        renderHistorial();
      });
    });

    $('#tipCard').addEventListener('click', function () {
      show(openAlerts().length ? 'alertas' : 'asistente');
    });
    $('#btnToAsistente').addEventListener('click', function () { show('asistente'); });

    $('#btnLog').addEventListener('click', function () {
      state.maintenance.unshift(Date.now());
      if (state.maintenance.length > C.maxMaintenance) state.maintenance.length = C.maxMaintenance;
      save();
      toast('Mantenimiento registrado');
      renderAsistente();
    });

    $('#btnHypoxia').addEventListener('click', function () {
      state.hypoxia = true;
      toast('Simulando caída de oxígeno…');
      renderMonitoreo();
    });
    $('#btnOffline').addEventListener('click', function () { setOnline(!state.online); });
    $('#btnReset').addEventListener('click', function () {
      state.hypoxia = false;
      toast('Valores volviendo a la normalidad');
      renderMonitoreo();
    });
  }

  function updateClock() { var d = new Date(); $('#clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function init() {
    bindForm();
    bindControls();
    updateClock();
    setInterval(updateClock, 30000);

    var saved = load();
    if (saved && saved.profile) {
      state.profile = saved.profile;
      state.alerts = saved.alerts || [];
      state.maintenance = saved.maintenance || [];
      $('#productor').value = saved.profile.productor;
      $('#vereda').value = saved.profile.vereda;
      $('#nodo').value = saved.profile.nodo;
      $('#consent').checked = true;
      var radio = $('input[name="especie"][value="' + saved.profile.especie + '"]');
      if (radio) radio.checked = true;
      startSession();
      show('monitoreo');
    } else {
      show('predio');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
