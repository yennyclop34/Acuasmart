var config = window.ACUA_CONFIG;
var simulador = window.AcuaSim;
var STORAGE_KEY = 'acuasmart.v1';

var NIVEL_ESTADO = { ok: 0, warn: 1, crit: 2 };
var TEXTO_HERO = { ok: 'ÓPTIMO', warn: 'PRECAUCIÓN', crit: 'RIESGO CRÍTICO' };
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var NOMBRE_VERIFICAR = { od: 'el oxígeno', temp: 'la temperatura', ph: 'el pH', cau: 'el caudal' };
var PANTALLA_NAV = { asistente: 'historial' };

var ICONOS_VAR = {
  od:   '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="3.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="17" cy="17" r="1.8"/></svg>',
  temp: '<svg viewBox="0 0 24 24"><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/></svg>',
  ph:   '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/></svg>',
  cau:  '<svg viewBox="0 0 24 24"><path d="M3 8h13a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h8"/></svg>'
};
var ICONO_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var ICONO_ALERTA = '<svg viewBox="0 0 24 24"><path d="M12 3l10 17H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>';

var state = {
  profile: null,
  history: [],
  latest: null,
  lastSync: null,
  pending: [],      // lecturas guardadas localmente cuando no hay internet
  nodeLast: null,     // última lectura del nodo sin conexión
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

function padZero(n) {
  if (n < 10) {
    return '0' + n;
  }
  return '' + n;
}

function obtenerHora(timestamp) {
  var d = new Date(timestamp);
  return padZero(d.getHours());
}

function formatoHora12(timestamp) {
  var d = new Date(timestamp);
  var h = d.getHours();
  var jornada = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) {
    h = 12;
  }
  return h + ':' + padZero(d.getMinutes()) + ' ' + jornada;
}

function etiquetaDia(timestamp) {
  var d = new Date(timestamp);
  var hoy = new Date();
  var esHoy = d.toDateString() === hoy.toDateString();
  var prefijo = esHoy ? 'Hoy, ' : '';
  return prefijo + d.getDate() + ' de ' + MESES[d.getMonth()];
}

function fechaCorta(timestamp) {
  var d = new Date(timestamp);
  return d.getDate() + ' ' + MESES_CORTOS[d.getMonth()] + '.';
}

function formatearValor(key, valor) {
  return Number(valor).toFixed(config.vars[key].decimals);
}

function textoUnidad(key) {
  if (config.vars[key].unit) {
    return ' ' + config.vars[key].unit;
  }
  return '';
}

function crearElemento(tag, clase, texto) {
  var nodo = document.createElement(tag);
  if (clase) {
    nodo.className = clase;
  }
  if (texto !== undefined && texto !== null) {
    nodo.textContent = texto;
  }
  return nodo;
}

function estaEnRango(valor, rango) {
  var cumpleMin = (rango[0] == null || valor >= rango[0]);
  var cumpleMax = (rango[1] == null || valor <= rango[1]);
  return cumpleMin && cumpleMax;
}

function obtenerRangos(key) {
  var especie = state.profile.especie;
  return config.species[especie].ranges[key];
}

function calcularEstado(key, valor) {
  var r = obtenerRangos(key);
  if (estaEnRango(valor, r.ok)) {
    return 'ok';
  }
  if (estaEnRango(valor, r.warn)) {
    return 'warn';
  }
  return 'crit';
}

function direccionFueraRango(key, valor) {
  var rangoOk = obtenerRangos(key).ok;
  if (rangoOk[0] != null && valor < rangoOk[0]) {
    return 'low';
  }
  return 'high';
}

function peorEstado(mapaEstados) {
  var peor = 'ok';
  var claves = Object.keys(mapaEstados);
  for (var i = 0; i < claves.length; i++) {
    var k = claves[i];
    if (NIVEL_ESTADO[mapaEstados[k]] > NIVEL_ESTADO[peor]) {
      peor = mapaEstados[k];
    }
  }
  return peor;
}

function veredaCorta() {
  var vereda = state.profile.vereda || 'Mi predio';
  return vereda.split(',')[0].trim();
}

function alertasAbiertas() {
  return state.alerts.filter(function (a) {
    return !a.resolved;
  });
}

function mostrarAviso(mensaje) {
  var toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(function () {
    toast.hidden = true;
  }, 3500);
}

function guardarLocal() {
  try {
    var datos = {
      profile: state.profile,
      alerts: state.alerts,
      maintenance: state.maintenance
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
  } catch (err) {
    console.warn('No se pudo guardar en localStorage:', err);
  }
}

function cargarLocal() {
  try {
    var guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) {
      return JSON.parse(guardado);
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Compara el caudal actual con las lecturas de la última semana
function tendenciaCaudal() {
  if (!state.latest) {
    return null;
  }
  var hace7Dias = Date.now() - 7 * 24 * 3600 * 1000;
  var valores = [];
  for (var i = 0; i < state.history.length; i++) {
    if (state.history[i].t >= hace7Dias) {
      valores.push(state.history[i].cau);
    }
  }
  if (valores.length === 0) {
    return null;
  }
  var suma = 0;
  for (var j = 0; j < valores.length; j++) {
    suma += valores[j];
  }
  var promedio = suma / valores.length;
  return Math.round(((state.latest.cau - promedio) / promedio) * 100);
}

// Recomendaciones básicas según la variable que salió de rango
function obtenerRecomendaciones(key, direccion) {
  var guia = {
    od: {
      low: [
        ['AIREACIÓN', 'Aumentar apertura de compuerta de entrada en 25% por 45 min'],
        ['MANTENIMIENTO', 'Limpiar sedimentos en rejilla de bocatoma']
      ]
    },
    temp: {
      high: [
        ['RENOVACIÓN', 'Aumentar el caudal de entrada para renovar el agua'],
        ['MANEJO', 'Dar sombra al estanque y suspender la ración en las horas de calor']
      ],
      low: [
        ['RECAMBIO', 'Reducir el recambio de agua en las horas más frías'],
        ['FUENTE', 'Revisar que la fuente no entregue agua demasiado fría']
      ]
    },
    ph: {
      low: [
        ['RECAMBIO', 'Hacer un recambio parcial con la fuente habitual'],
        ['VERIFICACIÓN', 'Medir de nuevo con un equipo patrón antes de actuar']
      ],
      high: [
        ['RECAMBIO', 'Hacer un recambio parcial con la fuente habitual'],
        ['VERIFICACIÓN', 'Medir de nuevo con un equipo patrón antes de actuar']
      ]
    },
    cau: {
      low: [
        ['BOCATOMA', 'Revisar la bocatoma: puede haber hojas o sedimento'],
        ['MANTENIMIENTO', 'Limpiar la rejilla y comprobar la apertura de la compuerta']
      ],
      high: [
        ['COMPUERTA', 'Reducir la apertura de la compuerta para evitar desbordamientos'],
        ['MANTENIMIENTO', 'Revisar el estanque por arrastre de sólidos tras la lluvia']
      ]
    }
  };

  if (guia[key] && guia[key][direccion]) {
    return guia[key][direccion];
  }
  return [['REVISIÓN', 'Revisar el estanque y verificar la medición']];
}

// Actualiza las alertas cuando llega una lectura nueva
function evaluarLectura(lectura, silencioso) {
  Object.keys(config.vars).forEach(function (key) {
    var estadoActual = calcularEstado(key, lectura[key]);
    var estadoAnterior = state.status[key] || 'ok';

    if (estadoActual !== 'ok' && NIVEL_ESTADO[estadoActual] > NIVEL_ESTADO[estadoAnterior]) {
      state.alerts.unshift({
        id: lectura.t + '-' + key,
        t: lectura.t,
        key: key,
        value: lectura[key],
        status: estadoActual,
        dir: direccionFueraRango(key, lectura[key]),
        limit: obtenerRangos(key).ok,
        resolved: false
      });

      if (state.alerts.length > config.maxAlerts) {
        state.alerts.length = config.maxAlerts;
      }

      if (!silencioso) {
        var prefijo = estadoActual === 'crit' ? 'Alerta crítica: ' : 'Precaución: ';
        mostrarAviso(prefijo + config.vars[key].label.toLowerCase());
      }
    }

    if (estadoActual === 'ok' && estadoAnterior !== 'ok') {
      for (var i = 0; i < state.alerts.length; i++) {
        if (state.alerts[i].key === key) {
          state.alerts[i].resolved = true;
        }
      }
    }

    state.status[key] = estadoActual;
  });

  guardarLocal();
}

// Recibe una lectura nueva
function aceptarLectura(lectura, silencioso) {
  state.history.push(lectura);
  if (state.history.length > config.maxHistoryPoints) {
    state.history.shift();
  }
  state.latest = lectura;
  state.lastSync = lectura.t;
  evaluarLectura(lectura, silencioso);
}

function cicloLectura() {
  if (!state.profile) {
    return;
  }
  var baseLectura = (!state.online && state.nodeLast) ? state.nodeLast : state.latest;
  var nuevaLectura = simulador.next(baseLectura, state.profile.especie, state.hypoxia);

  if (state.online) {
    aceptarLectura(nuevaLectura, false);
  } else {
    // Si no hay señal, el nodo acumula las lecturas en memoria local
    state.pending.push(nuevaLectura);
    state.nodeLast = nuevaLectura;
  }
  renderTodo();
}

function cambiarConexion(conectado) {
  if (state.online === conectado) {
    return;
  }
  state.online = conectado;

  if (conectado) {
    var cola = state.pending.slice();
    state.pending = [];
    state.nodeLast = null;
    for (var i = 0; i < cola.length; i++) {
      aceptarLectura(cola[i], true);
    }
    if (cola.length > 0) {
      console.log('Sincronización completada:', cola.length, 'lecturas');
      mostrarAviso('Sincronizado: ' + cola.length + ' lecturas enviadas a la nube');
    } else {
      mostrarAviso('Conexión restablecida');
    }
  } else {
    mostrarAviso('Sin señal: el nodo guarda las lecturas');
  }

  renderTodo();
}

function renderBarraSuperior() {
  var net = document.getElementById('netBadge');
  net.textContent = state.online ? '4G' : 'Sin señal';
  net.className = 'net ' + (state.online ? 'net--on' : 'net--off');

  var banner = document.getElementById('offlineBanner');
  banner.hidden = state.online;
  if (!state.online) {
    banner.textContent = 'Sin conexión. Mostrando el último dato sincronizado a las ' + formatoHora12(state.lastSync || Date.now()) + '.';
  }

  var pendientes = alertasAbiertas().length;
  var badge = document.getElementById('navBadge');
  badge.hidden = pendientes === 0;
  badge.textContent = pendientes;
}

function etiquetaVariable(key, valor) {
  var s = calcularEstado(key, valor);
  if (s !== 'ok') {
    var esBajo = direccionFueraRango(key, valor) === 'low';
    var txt = esBajo ? 'Bajo' : 'Alto';
    if (s === 'crit') {
      txt += ' · crítico';
    }
    return { cls: s, text: txt };
  }

  if (key === 'cau') {
    var tend = tendenciaCaudal();
    if (tend != null && tend <= -config.flowTrendThreshold) {
      return { cls: 'warn', text: '↘ ' + tend + '% Flujo' };
    }
    if (tend != null && tend >= config.flowTrendThreshold) {
      return { cls: 'warn', text: '↗ +' + tend + '% Flujo' };
    }
  }

  var etiquetas = {
    od: 'Óptimo',
    temp: 'Estable',
    ph: (valor >= 6.8 && valor <= 7.6) ? 'Neutro' : 'Normal',
    cau: 'Estable'
  };
  return { cls: 'ok', text: '✓ ' + etiquetas[key] };
}

function textoHaceCuanto(timestamp) {
  var minutos = Math.floor((Date.now() - timestamp) / 60000);
  if (minutos < 1) {
    return 'hace menos de 1 min';
  }
  return 'hace ' + minutos + ' min';
}

function renderMonitoreo() {
  if (!state.latest || !state.profile) {
    return;
  }

  document.getElementById('monSub').textContent = veredaCorta() + ' · ' + config.species[state.profile.especie].name;

  var general = peorEstado(state.status);
  var hero = document.getElementById('overall');
  hero.dataset.status = general;

  var iconoHero = general === 'ok' ? ICONO_OK : ICONO_ALERTA;
  document.getElementById('heroLabel').innerHTML = iconoHero + '<span>Estado del Estanque:</span>';
  document.getElementById('heroState').textContent = TEXTO_HERO[general];

  if (state.online) {
    document.getElementById('syncInfo').textContent = 'Última lectura ' + textoHaceCuanto(state.lastSync);
  } else {
    document.getElementById('syncInfo').textContent = 'Sin conexión desde las ' + formatoHora12(state.lastSync);
  }

  var badge = document.getElementById('monBadge');
  badge.dataset.status = general;
  badge.innerHTML = iconoHero;

  var contenedor = document.getElementById('cards');
  contenedor.textContent = '';

  Object.keys(config.vars).forEach(function (key) {
    var v = state.latest[key];
    var pill = etiquetaVariable(key, v);
    var card = crearElemento('div', 'metric');
    card.dataset.status = calcularEstado(key, v);

    var head = crearElemento('div', 'metric__head');
    head.innerHTML = ICONOS_VAR[key];
    head.appendChild(crearElemento('span', 'metric__name', config.vars[key].card));
    card.appendChild(head);

    var val = crearElemento('div', 'metric__value', formatearValor(key, v));
    if (config.vars[key].unit) {
      val.appendChild(crearElemento('span', 'metric__unit', config.vars[key].unit));
    }
    card.appendChild(val);

    card.appendChild(crearElemento('span', 'pill pill--' + pill.cls, pill.text));
    contenedor.appendChild(card);
  });

  renderSugerencia();

  var infoPendientes = document.getElementById('pendingInfo');
  if (state.pending.length > 0) {
    infoPendientes.textContent = 'El nodo tiene ' + state.pending.length + ' lecturas guardadas localmente, pendientes de enviar.';
  } else {
    infoPendientes.textContent = '';
  }

  document.getElementById('btnOffline').textContent = state.online ? 'Simular pérdida de señal' : 'Restablecer conexión';
  document.getElementById('btnHypoxia').disabled = state.hypoxia;
}

function renderSugerencia() {
  var tip = document.getElementById('tipCard');
  var abiertas = alertasAbiertas();
  var tend = tendenciaCaudal();
  var titulo = '';
  var texto = '';

  if (abiertas.length > 0) {
    var primera = abiertas[0];
    titulo = 'Atiende la alerta de ' + config.vars[primera.key].short.toLowerCase();
    texto = 'Abre el Centro de alertas para ver qué hacer ahora.';
  } else if (tend != null && tend <= -config.flowTrendThreshold) {
    titulo = 'Revisa la bocatoma';
    texto = 'El caudal bajó ' + Math.abs(tend) + '%. Verifica si hay hojas o sedimentos en la rejilla.';
  } else {
    titulo = 'Todo en orden';
    texto = 'Las lecturas están en rango. Revisa la rejilla en tu ronda diaria.';
  }

  tip.textContent = '';
  tip.appendChild(crearElemento('p', 'tip__eyebrow', 'SUGERENCIA RÁPIDA'));
  tip.appendChild(crearElemento('p', 'tip__title', titulo));
  tip.appendChild(crearElemento('p', 'tip__text', texto));
}

var RANGO_MS = {
  '24h': 24 * 3600 * 1000,
  '7d':  7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000
};
var NOMBRE_RANGO = { '24h': '24 h', '7d': '7 días', '30d': '30 días' };

function agruparPuntos(datos, tInicio, tFin, bloques) {
  var tamano = (tFin - tInicio) / bloques;
  var sumas = [];
  var conteos = [];
  for (var i = 0; i < bloques; i++) {
    sumas.push(0);
    conteos.push(0);
  }

  for (var j = 0; j < datos.length; j++) {
    var p = datos[j];
    var idx = Math.floor((p.t - tInicio) / tamano);
    if (idx < 0) idx = 0;
    if (idx >= bloques) idx = bloques - 1;
    sumas[idx] += p.v;
    conteos[idx]++;
  }

  var salida = [];
  for (var k = 0; k < bloques; k++) {
    if (conteos[k] > 0) {
      salida.push({
        t: tInicio + tamano * (k + 0.5),
        v: sumas[k] / conteos[k]
      });
    }
  }
  return salida;
}

function calcularMarcasEje(min, max, divisiones) {
  var pasoCrudo = (max - min) / divisiones;
  var magnitud = Math.pow(10, Math.floor(Math.log10(pasoCrudo)));
  var factor = pasoCrudo / magnitud;
  var multiplicador = 10;
  if (factor < 1.5) {
    multiplicador = 1;
  } else if (factor < 3) {
    multiplicador = 2;
  } else if (factor < 7) {
    multiplicador = 5;
  }
  var paso = multiplicador * magnitud;

  var marcas = [];
  for (var v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) {
    marcas.push(+v.toFixed(6));
  }
  return marcas;
}

function renderHistorial() {
  if (!state.profile || state.history.length === 0) {
    return;
  }

  var key = state.activeVar;
  var def = config.vars[key];
  var r = obtenerRangos(key);
  var tFin = Date.now();
  var tInicio = tFin - RANGO_MS[state.range];

  var filtrados = [];
  for (var i = 0; i < state.history.length; i++) {
    if (state.history[i].t >= tInicio) {
      filtrados.push({ t: state.history[i].t, v: state.history[i][key] });
    }
  }
  if (filtrados.length === 0) {
    return;
  }

  var numBloques = state.range === '24h' ? 48 : 90;
  var puntos = agruparPuntos(filtrados, tInicio, tFin, numBloques);

  document.getElementById('hisSub').textContent = veredaCorta() + ' · Tendencias del estanque';
  document.getElementById('chartTitle').textContent = state.range === '24h' ? 'Evolución horaria' : 'Evolución diaria';

  if (state.range === '24h') {
    document.getElementById('chartSub').textContent = fechaCorta(tInicio) + ', ' + obtenerHora(tInicio) + ' h – ' + fechaCorta(tFin) + ', ' + obtenerHora(tFin) + ' h';
  } else {
    document.getElementById('chartSub').textContent = fechaCorta(tInicio) + ' – ' + fechaCorta(tFin);
  }

  var leyenda = [];
  if (r.ok[0] != null) {
    leyenda.push('Umbral mínimo: ' + r.ok[0].toFixed(def.decimals) + textoUnidad(key));
  }
  if (r.ok[1] != null) {
    leyenda.push('Umbral máximo: ' + r.ok[1].toFixed(def.decimals) + textoUnidad(key));
  }
  document.getElementById('chartLegend').textContent = leyenda.length > 0 ? '-- ' + leyenda.join(' · ') : '';

  // Tamaño del gráfico
  var W = 340, H = 190, L = 38, R = 10, T = 10, B = 26;
  var vals = puntos.map(function (p) { return p.v; });
  var lo = Math.min.apply(null, vals);
  var hi = Math.max.apply(null, vals);

  if (r.ok[0] != null) lo = Math.min(lo, r.ok[0]);
  if (r.ok[1] != null) hi = Math.max(hi, r.ok[1]);

  var margen = ((hi - lo) || 1) * 0.08;
  lo -= margen;
  hi += margen;

  function posX(t) {
    return L + ((t - tInicio) / (tFin - tInicio)) * (W - L - R);
  }
  function posY(v) {
    return T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  }

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  function agregarSvg(tag, attrs, texto) {
    var nodo = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) {
      nodo.setAttribute(k, attrs[k]);
    });
    if (texto != null) {
      nodo.textContent = texto;
    }
    svg.appendChild(nodo);
  }

  // Marcas del eje vertical
  calcularMarcasEje(lo, hi, 3).forEach(function (tv) {
    agregarSvg('line', { x1: L, x2: W - R, y1: posY(tv), y2: posY(tv), 'class': 'grid' });
    agregarSvg('text', { x: L - 6, y: posY(tv) + 4, 'text-anchor': 'end' }, tv.toFixed(def.decimals));
  });

  // Horas o fechas del eje horizontal
  for (var k = 0; k <= 4; k++) {
    var tt = tInicio + ((tFin - tInicio) * k) / 4;
    var etiquetaX = state.range === '24h' ? obtenerHora(tt) + ' h' : fechaCorta(tt);
    var alineacion = 'middle';
    if (k === 0) alineacion = 'start';
    if (k === 4) alineacion = 'end';
    agregarSvg('text', { x: posX(tt), y: H - 8, 'text-anchor': alineacion }, etiquetaX);
  }

  // Límites  para la variabl
  [r.ok[0], r.ok[1]].forEach(function (limite) {
    if (limite != null) {
      agregarSvg('line', { x1: L, x2: W - R, y1: posY(limite), y2: posY(limite), 'class': 'limit' });
    }
  });

  // Dibuja la lnea con las lecturas
  var d = '';
  for (var idx = 0; idx < puntos.length; idx++) {
    var pref = idx === 0 ? 'M' : 'L';
    d += pref + posX(puntos[idx].t).toFixed(1) + ' ' + posY(puntos[idx].v).toFixed(1) + ' ';
  }
  var ultimo = puntos[puntos.length - 1];
  agregarSvg('path', {
    d: d + 'L' + posX(ultimo.t).toFixed(1) + ' ' + (H - B) + ' L' + posX(puntos[0].t).toFixed(1) + ' ' + (H - B) + ' Z',
    'class': 'area'
  });
  agregarSvg('path', { d: d.trim(), 'class': 'line' });
  agregarSvg('circle', { cx: posX(ultimo.t), cy: posY(ultimo.v), r: 4.5, 'class': 'dot' });

  var contenedorGrafica = document.getElementById('chart');
  contenedorGrafica.textContent = '';
  contenedorGrafica.appendChild(svg);

  // Calcula los datos que se muestran debajo del graficio
  var valoresCrudos = filtrados.map(function (p) { return p.v; });
  var minimo = Math.min.apply(null, valoresCrudos);
  var maximo = Math.max.apply(null, valoresCrudos);
  var fueraRango = 0;
  var peor = 'ok';

  for (var m = 0; m < valoresCrudos.length; m++) {
    var valActual = valoresCrudos[m];
    if (!estaEnRango(valActual, r.ok)) {
      fueraRango++;
    }
    var st = calcularEstado(key, valActual);
    if (NIVEL_ESTADO[st] > NIVEL_ESTADO[peor]) {
      peor = st;
    }
  }

  var sum = document.getElementById('summary');
  sum.dataset.status = peor;
  sum.textContent = '';
  sum.appendChild(crearElemento('p', 'summary__eyebrow', 'RESUMEN ANALÍTICO'));

  var tituloResumen = def.short + ' en rango seguro';
  if (peor === 'warn') tituloResumen = def.short + ' con episodios de precaución';
  if (peor === 'crit') tituloResumen = def.short + ' con episodios críticos';
  sum.appendChild(crearElemento('p', 'summary__title', tituloResumen));

  sum.appendChild(crearElemento('p', 'summary__line summary__line--strong', 'Mín. ' + formatearValor(key, minimo) + ' · Máx. ' + formatearValor(key, maximo) + textoUnidad(key)));

  var textoFuera = r.ok[1] == null ? 'bajo el umbral' : 'fuera del umbral';
  if (fueraRango === 0) {
    sum.appendChild(crearElemento('p', 'summary__line', 'Sin lecturas ' + textoFuera + ' en ' + NOMBRE_RANGO[state.range] + '.'));
  } else {
    var porcentaje = Math.round((fueraRango / valoresCrudos.length) * 100);
    sum.appendChild(crearElemento('p', 'summary__line', porcentaje + ' % de las lecturas estuvo ' + textoFuera + ' en ' + NOMBRE_RANGO[state.range] + '.'));
  }
}

function renderAlertas() {
  var abiertas = alertasAbiertas();
  var caja = document.getElementById('activeAlert');
  caja.textContent = '';

  var subtitulo = state.profile ? veredaCorta() + ' · ' : '';
  if (abiertas.length === 0) {
    subtitulo += 'Sin alertas por atender';
  } else if (abiertas.length === 1) {
    subtitulo += '1 alerta por atender';
  } else {
    subtitulo += abiertas.length + ' alertas por atender';
  }
  document.getElementById('aleSub').textContent = subtitulo;

  if (abiertas.length === 0) {
    var sinAlerta = crearElemento('div', 'alert alert--none');
    sinAlerta.appendChild(crearElemento('p', 'alert__top', 'Todo en orden'));
    sinAlerta.appendChild(crearElemento('p', 'alert__msg', 'Las cuatro variables están dentro del rango normal para tu especie.'));
    caja.appendChild(sinAlerta);
  } else {
    var ordenadas = abiertas.slice().sort(function (a, b) {
      return NIVEL_ESTADO[b.status] - NIVEL_ESTADO[a.status] || b.t - a.t;
    });
    var alerta = ordenadas[0];
    var def = config.vars[alerta.key];

    var card = crearElemento('div', 'alert' + (alerta.status === 'warn' ? ' alert--warn' : ''));
    var top = crearElemento('p', 'alert__top');
    top.innerHTML = ICONO_ALERTA;
    top.appendChild(crearElemento('span', null, alerta.status === 'crit' ? 'ALERTA CRÍTICA' : 'PRECAUCIÓN'));
    card.appendChild(top);

    card.appendChild(crearElemento('p', 'alert__msg', def.label + (alerta.dir === 'low' ? ' descendió a' : ' subió a')));

    var numGrande = crearElemento('p', 'alert__big', formatearValor(alerta.key, alerta.value));
    if (def.unit) {
      numGrande.appendChild(crearElemento('span', 'alert__unit', def.unit));
    }
    card.appendChild(numGrande);

    card.appendChild(crearElemento('p', 'alert__meta', formatoHora12(alerta.t) + ' · ' + etiquetaDia(alerta.t)));

    var detalleLimite = alerta.dir === 'low'
      ? 'Por debajo del mínimo de ' + alerta.limit[0].toFixed(def.decimals) + textoUnidad(alerta.key)
      : 'Por encima del máximo de ' + alerta.limit[1].toFixed(def.decimals) + textoUnidad(alerta.key);
    card.appendChild(crearElemento('p', 'alert__meta', detalleLimite));
    caja.appendChild(card);

    caja.appendChild(crearElemento('h2', 'section-title', 'Acciones recomendadas'));
    var recs = obtenerRecomendaciones(alerta.key, alerta.dir);
    for (var i = 0; i < recs.length; i++) {
      var recBox = crearElemento('div', 'rec');
      recBox.appendChild(crearElemento('p', 'rec__prio', 'PRIORIDAD ' + (i + 1) + ' · ' + recs[i][0]));
      recBox.appendChild(crearElemento('p', 'rec__text', (i + 1) + '. ' + recs[i][1]));
      caja.appendChild(recBox);
    }

    caja.appendChild(crearElemento('p', 'foot', 'Verifica ' + NOMBRE_VERIFICAR[alerta.key] + ' después de actuar.'));

    var btnIr = crearElemento('button', 'btn btn--blue', 'Ver monitoreo en tiempo real');
    btnIr.type = 'button';
    btnIr.addEventListener('click', function () {
      mostrarPantalla('monitoreo');
    });
    caja.appendChild(btnIr);
  }

  var lista = document.getElementById('alertList');
  lista.textContent = '';
  if (state.alerts.length === 0) {
    lista.appendChild(crearElemento('li', 'alist__empty', 'Todavía no se han emitido alertas.'));
  }

  for (var j = 0; j < state.alerts.length; j++) {
    var item = state.alerts[j];
    var vDef = config.vars[item.key];
    var li = crearElemento('li');
    li.dataset.status = item.status;
    li.dataset.resolved = String(item.resolved);

    var tituloItem = vDef.label + (item.dir === 'low' ? ' bajo: ' : ' alto: ') + formatearValor(item.key, item.value) + textoUnidad(item.key);
    li.appendChild(crearElemento('strong', null, tituloItem));

    var descItem = etiquetaDia(item.t) + ', ' + formatoHora12(item.t) + ' · ' + (item.status === 'crit' ? 'Crítica' : 'Precaución');
    if (item.resolved) {
      descItem += ' · Resuelta';
    }
    li.appendChild(crearElemento('span', null, descItem));
    lista.appendChild(li);
  }
}

function renderAsistente() {
  if (!state.profile || !state.latest) {
    return;
  }

  var hace7Dias = Date.now() - 7 * 24 * 3600 * 1000;
  var semana = state.history.filter(function (p) { return p.t >= hace7Dias; });
  var listaOd = semana.map(function (p) { return p.od; });
  var odMin = Math.min.apply(null, listaOd);
  var odMax = Math.max.apply(null, listaOd);
  var minPermitido = obtenerRangos('od').ok[0];
  var odOk = odMin >= (minPermitido == null ? -Infinity : minPermitido);

  var tend = tendenciaCaudal();
  var textoTendencia = 'Estable';
  if (tend != null && tend <= -5) {
    textoTendencia = 'Bajó ' + Math.abs(tend) + '%';
  } else if (tend != null && tend >= 5) {
    textoTendencia = 'Subió ' + tend + '%';
  }

  var analisis = document.getElementById('analysis');
  analisis.textContent = '';
  analisis.appendChild(crearElemento('p', 'analysis__eyebrow', 'ANÁLISIS · ÚLTIMOS 7 DÍAS'));
  analisis.appendChild(crearElemento('p', 'analysis__title', 'Cuida el agua, prevén fallas'));
  analisis.appendChild(crearElemento('p', 'analysis__line', 'Caudal: ' + formatearValor('cau', state.latest.cau) + ' L/min · ' + textoTendencia));
  analisis.appendChild(crearElemento('p', 'analysis__line', 'Oxígeno: ' + odMin.toFixed(1) + '–' + odMax.toFixed(1) + ' mg/L · ' + (odOk ? 'En rango' : 'Con episodios bajos')));

  var hayCritico = peorEstado(state.status) === 'crit';
  var requiereAccion = hayCritico || (tend != null && tend <= -config.flowTrendThreshold);

  var textoRecambio = 'El caudal está estable. Mantén el recambio habitual y revisa el oxígeno a primera hora.';
  if (hayCritico) {
    textoRecambio = 'Hay una alerta crítica. Sigue primero las acciones del Centro de alertas y luego define el recambio con apoyo técnico.';
  } else if (requiereAccion) {
    textoRecambio = 'Primero limpia la entrada de agua. Si el caudal no mejora, ajusta el recambio con apoyo técnico.';
  }

  var pasos = document.getElementById('steps');
  pasos.textContent = '';

  var tarjetasPasos = [
    {
      badge: requiereAccion ? 'HOY' : 'SEGUIMIENTO',
      cls: requiereAccion ? 'warn' : 'ok',
      title: '1. Recambio de agua',
      text: textoRecambio
    },
    {
      badge: 'REVISIÓN DIARIA',
      cls: 'ok',
      title: '2. Mantenimiento del estanque',
      text: 'Retira hojas de la rejilla y revisa la salida del estanque. Registra la limpieza y vuelve a medir el caudal.'
    }
  ];

  for (var i = 0; i < tarjetasPasos.length; i++) {
    var s = tarjetasPasos[i];
    var card = crearElemento('article', 'step');
    card.appendChild(crearElemento('p', 'step__badge step__badge--' + s.cls, s.badge));
    card.appendChild(crearElemento('h2', 'step__title', s.title));
    card.appendChild(crearElemento('p', 'step__text', s.text));
    pasos.appendChild(card);
  }

  document.getElementById('astFoot').textContent = veredaCorta() + ' · ' + config.species[state.profile.especie].name + '. Datos de ejemplo para esta interfaz.';

  var ultimoRegistro = state.maintenance[0];
  document.getElementById('lastLog').textContent = ultimoRegistro
    ? 'Último registro: ' + etiquetaDia(ultimoRegistro) + ', ' + formatoHora12(ultimoRegistro) + '.'
    : '';
}

function renderTodo() {
  renderBarraSuperior();
  if (!state.profile) {
    return;
  }
  renderMonitoreo();
  if (state.screen === 'historial') renderHistorial();
  if (state.screen === 'alertas') renderAlertas();
  if (state.screen === 'asistente') renderAsistente();
}

function mostrarPantalla(nombre) {
  if (nombre !== 'predio' && !state.profile) {
    mostrarAviso('Primero configura tu estanque');
    nombre = 'predio';
  }
  state.screen = nombre;

  document.querySelectorAll('.screen').forEach(function (sec) {
    sec.hidden = sec.id !== 'screen-' + nombre;
  });

  var navActivo = PANTALLA_NAV[nombre] || nombre;
  document.querySelectorAll('.nav__btn').forEach(function (btn) {
    btn.classList.toggle('is-active', btn.dataset.target === navActivo);
  });

  var main = document.querySelector('main');
  if (main) {
    main.scrollTop = 0;
  }
  window.scrollTo(0, 0);
  renderTodo();
}

function iniciarSesion() {
  state.history = simulador.createHistory(state.profile.especie);
  state.latest = state.history[state.history.length - 1];
  state.lastSync = state.latest.t;
  state.pending = [];
  state.nodeLast = null;
  state.online = true;
  state.hypoxia = false;
  state.status = {};

  Object.keys(config.vars).forEach(function (k) {
    state.status[k] = calcularEstado(k, state.latest[k]);
  });

  clearInterval(state.timer);
  state.timer = setInterval(cicloLectura, config.tickMs);
}

function configurarFormulario() {
  var form = document.getElementById('predioForm');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = document.getElementById('productor').value.trim();
    var vereda = document.getElementById('vereda').value.trim();
    var nodo = document.getElementById('nodo').value.trim();
    var especie = form.elements.especie.value;
    var err = document.getElementById('formError');

    if (!nombre || !vereda || !nodo) {
      err.textContent = 'Completa el nombre, la vereda y el ID del nodo.';
      err.hidden = false;
      return;
    }
    if (!document.getElementById('consent').checked) {
      err.textContent = 'Para continuar, autoriza el tratamiento de tus datos.';
      err.hidden = false;
      return;
    }
    err.hidden = true;

    var cambioEspecie = !state.profile || state.profile.especie !== especie;
    state.profile = {
      productor: nombre,
      vereda: vereda,
      especie: especie,
      nodo: nodo,
      consent: true
    };

    if (cambioEspecie || state.history.length === 0) {
      state.alerts = [];
      iniciarSesion();
    }

    guardarLocal();
    mostrarAviso('Estanque guardado');
    mostrarPantalla('monitoreo');
  });

  document.getElementById('btnPrivacy').addEventListener('click', function () {
    var modal = document.getElementById('privacy');
    if (modal.showModal) {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
  });
}

function configurarControles() {
  document.querySelectorAll('.nav__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      mostrarPantalla(btn.dataset.target);
    });
  });

  var selectVar = document.getElementById('varSelect');
  Object.keys(config.vars).forEach(function (k) {
    var opcion = crearElemento('option', null, config.vars[k].label + textoUnidad(k));
    opcion.value = k;
    selectVar.appendChild(opcion);
  });
  selectVar.addEventListener('change', function () {
    state.activeVar = selectVar.value;
    renderHistorial();
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.range = tab.dataset.range;
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      renderHistorial();
    });
  });

  document.getElementById('tipCard').addEventListener('click', function () {
    mostrarPantalla(alertasAbiertas().length > 0 ? 'alertas' : 'asistente');
  });

  document.getElementById('btnToAsistente').addEventListener('click', function () {
    mostrarPantalla('asistente');
  });

  document.getElementById('btnLog').addEventListener('click', function () {
    state.maintenance.unshift(Date.now());
    if (state.maintenance.length > config.maxMaintenance) {
      state.maintenance.length = config.maxMaintenance;
    }
    guardarLocal();
    mostrarAviso('Mantenimiento registrado');
    renderAsistente();
  });

  document.getElementById('btnHypoxia').addEventListener('click', function () {
    state.hypoxia = true;
    mostrarAviso('Simulando caída de oxígeno…');
    renderMonitoreo();
  });

  document.getElementById('btnOffline').addEventListener('click', function () {
    cambiarConexion(!state.online);
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    state.hypoxia = false;
    mostrarAviso('Valores volviendo a la normalidad');
    renderMonitoreo();
  });
}

function actualizarReloj() {
  var ahora = new Date();
  document.getElementById('clock').textContent = padZero(ahora.getHours()) + ':' + padZero(ahora.getMinutes());
}

function iniciarApp() {
  configurarFormulario();
  configurarControles();
  actualizarReloj();
  setInterval(actualizarReloj, 30000);

  var datosGuardados = cargarLocal();
  if (datosGuardados && datosGuardados.profile) {
    state.profile = datosGuardados.profile;
    state.alerts = datosGuardados.alerts || [];
    state.maintenance = datosGuardados.maintenance || [];

    document.getElementById('productor').value = datosGuardados.profile.productor;
    document.getElementById('vereda').value = datosGuardados.profile.vereda;
    document.getElementById('nodo').value = datosGuardados.profile.nodo;
    document.getElementById('consent').checked = true;

    var radioEspecie = document.querySelector('input[name="especie"][value="' + datosGuardados.profile.especie + '"]');
    if (radioEspecie) {
      radioEspecie.checked = true;
    }

    iniciarSesion();
    mostrarPantalla('monitoreo');
  } else {
    mostrarPantalla('predio');
  }
  console.log('Acuasmart Rural iniciado');
}

document.addEventListener('DOMContentLoaded', iniciarApp);
