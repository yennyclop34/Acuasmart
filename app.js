// Lógica principal de Acuasmart Rural

const cfg = window.ACUA_CONFIG;
const simulador = window.AcuaSim;
const CLAVE_STORAGE = 'acuasmart_datos_v1';

const PESO_ESTADO = { ok: 0, warn: 1, crit: 2 };
const TITULO_ESTADO = { ok: 'ÓPTIMO', warn: 'PRECAUCIÓN', crit: 'RIESGO CRÍTICO' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const TEXTO_VERIFICAR = { od: 'el oxígeno', temp: 'la temperatura', ph: 'el pH', cau: 'el caudal' };
const MENU_ACTIVO = { asistente: 'historial' };

const ICONOS = {
  od:   '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="3.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="17" cy="17" r="1.8"/></svg>',
  temp: '<svg viewBox="0 0 24 24"><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/></svg>',
  ph:   '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/></svg>',
  cau:  '<svg viewBox="0 0 24 24"><path d="M3 8h13a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h8"/></svg>'
};
const ICONO_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICONO_ALERTA = '<svg viewBox="0 0 24 24"><path d="M12 3l10 17H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>';

const datosApp = {
  perfil: null,
  historial: [],
  ultimaLectura: null,
  ultimaSincro: null,
  pendientes: [],
  ultimaNodo: null,
  conectado: true,
  hipoxia: false,
  estados: {},
  alertas: [],
  mantenimientos: [],
  variableActiva: 'od',
  rangoTiempo: '24h',
  pantallaActual: 'predio',
  temporizador: null,
  temporizadorAviso: null
};

function dosDigitos(num) {
  return num < 10 ? '0' + num : String(num);
}

function horaDosDigitos(timestamp) {
  return dosDigitos(new Date(timestamp).getHours());
}

function formatoHora12(timestamp) {
  const fecha = new Date(timestamp);
  let horas = fecha.getHours();
  const jornada = horas >= 12 ? 'p.m.' : 'a.m.';
  horas = horas % 12 || 12;
  return horas + ':' + dosDigitos(fecha.getMinutes()) + ' ' + jornada;
}

function etiquetaFecha(timestamp) {
  const fecha = new Date(timestamp);
  const esHoy = fecha.toDateString() === new Date().toDateString();
  return (esHoy ? 'Hoy, ' : '') + fecha.getDate() + ' de ' + MESES[fecha.getMonth()];
}

function fechaCorta(timestamp) {
  const fecha = new Date(timestamp);
  return fecha.getDate() + ' ' + MESES_CORTOS[fecha.getMonth()] + '.';
}

function formatearNumero(clave, valor) {
  return Number(valor).toFixed(cfg.variables[clave].decimales);
}

function unidadConEspacio(clave) {
  const unidad = cfg.variables[clave].unidad;
  return unidad ? ' ' + unidad : '';
}

function crearNodo(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
}

function dentroDeRango(valor, rango) {
  const cumpleMin = rango[0] == null || valor >= rango[0];
  const cumpleMax = rango[1] == null || valor <= rango[1];
  return cumpleMin && cumpleMax;
}

function rangosVariable(clave) {
  return cfg.especies[datosApp.perfil.especie].rangos[clave];
}

function evaluarEstado(clave, valor) {
  const r = rangosVariable(clave);
  if (dentroDeRango(valor, r.ok)) return 'ok';
  if (dentroDeRango(valor, r.warn)) return 'warn';
  return 'crit';
}

function direccionDesvio(clave, valor) {
  const ok = rangosVariable(clave).ok;
  return (ok[0] != null && valor < ok[0]) ? 'low' : 'high';
}

function estadoMasCritico(mapaEstados) {
  let peor = 'ok';
  Object.keys(mapaEstados).forEach(function (clave) {
    if (PESO_ESTADO[mapaEstados[clave]] > PESO_ESTADO[peor]) {
      peor = mapaEstados[clave];
    }
  });
  return peor;
}

function nombreVeredaCorto() {
  return (datosApp.perfil.vereda || 'Mi predio').split(',')[0].trim();
}

function alertasSinResolver() {
  return datosApp.alertas.filter(function (a) {
    return !a.resolved;
  });
}

function mostrarAviso(mensaje) {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.hidden = false;
  clearTimeout(datosApp.temporizadorAviso);
  datosApp.temporizadorAviso = setTimeout(function () {
    toast.hidden = true;
  }, 3500);
}

// Guarda perfil y alertas en el navegador
function guardarDatos() {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify({
      perfil: datosApp.perfil,
      alertas: datosApp.alertas,
      mantenimientos: datosApp.mantenimientos
    }));
  } catch (e) {
    // Si el navegador bloquea almacenamiento local, continúa en memoria
  }
}

function cargarDatos() {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    return guardado ? JSON.parse(guardado) : null;
  } catch (e) {
    return null;
  }
}

// Porcentaje de cambio del caudal frente al promedio semanal
function variacionCaudal() {
  if (!datosApp.ultimaLectura) return null;
  const hace7Dias = Date.now() - 7 * 24 * 3600 * 1000;
  const lecturas = datosApp.historial
    .filter(function (p) { return p.t >= hace7Dias; })
    .map(function (p) { return p.cau; });

  if (!lecturas.length) return null;

  let suma = 0;
  for (let i = 0; i < lecturas.length; i++) {
    suma += lecturas[i];
  }
  const promedio = suma / lecturas.length;
  return Math.round(((datosApp.ultimaLectura.cau - promedio) / promedio) * 100);
}

function accionesSugeridas(clave, direccion) {
  const lista = {
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
  return (lista[clave] && lista[clave][direccion]) || [['REVISIÓN', 'Revisar el estanque y verificar la medición']];
}

function revisarAlertas(lectura, silencioso) {
  Object.keys(cfg.variables).forEach(function (clave) {
    const estado = evaluarEstado(clave, lectura[clave]);
    const anterior = datosApp.estados[clave] || 'ok';

    if (estado !== 'ok' && PESO_ESTADO[estado] > PESO_ESTADO[anterior]) {
      datosApp.alertas.unshift({
        id: lectura.t + '-' + clave,
        t: lectura.t,
        key: clave,
        value: lectura[clave],
        status: estado,
        dir: direccionDesvio(clave, lectura[clave]),
        limit: rangosVariable(clave).ok,
        resolved: false
      });

      if (datosApp.alertas.length > cfg.maxAlertas) {
        datosApp.alertas.length = cfg.maxAlertas;
      }

      if (!silencioso) {
        const prefijo = estado === 'crit' ? 'Alerta crítica: ' : 'Precaución: ';
        mostrarAviso(prefijo + cfg.variables[clave].nombre.toLowerCase());
      }
    }

    if (estado === 'ok' && anterior !== 'ok') {
      datosApp.alertas.forEach(function (a) {
        if (a.key === clave) a.resolved = true;
      });
    }

    datosApp.estados[clave] = estado;
  });

  guardarDatos();
}

function registrarLectura(lectura, silencioso) {
  datosApp.historial.push(lectura);
  if (datosApp.historial.length > cfg.maxPuntosHistorial) {
    datosApp.historial.shift();
  }
  datosApp.ultimaLectura = lectura;
  datosApp.ultimaSincro = lectura.t;
  revisarAlertas(lectura, silencioso);
}

function cicloMonitoreo() {
  if (!datosApp.perfil) return;
  const base = (!datosApp.conectado && datosApp.ultimaNodo) ? datosApp.ultimaNodo : datosApp.ultimaLectura;
  const lectura = simulador.siguienteLectura(base, datosApp.perfil.especie, datosApp.hipoxia);

  if (datosApp.conectado) {
    registrarLectura(lectura, false);
  } else {
    datosApp.pendientes.push(lectura);
    datosApp.ultimaNodo = lectura;
  }
  actualizarVista();
}

function cambiarEstadoRed(enLinea) {
  if (datosApp.conectado === enLinea) return;
  datosApp.conectado = enLinea;

  if (enLinea) {
    const cola = datosApp.pendientes.slice();
    datosApp.pendientes = [];
    datosApp.ultimaNodo = null;
    cola.forEach(function (lectura) {
      registrarLectura(lectura, true);
    });
    mostrarAviso(cola.length ? 'Sincronizado: ' + cola.length + ' lecturas enviadas a la nube' : 'Conexión restablecida');
  } else {
    mostrarAviso('Sin señal: el nodo guarda las lecturas');
  }

  actualizarVista();
}

function pintarBarraSuperior() {
  const net = document.getElementById('netBadge');
  net.textContent = datosApp.conectado ? '4G' : 'Sin señal';
  net.className = 'net ' + (datosApp.conectado ? 'net--on' : 'net--off');

  const banner = document.getElementById('offlineBanner');
  banner.hidden = datosApp.conectado;
  if (!datosApp.conectado) {
    banner.textContent = 'Sin conexión. Mostrando el último dato sincronizado a las ' + formatoHora12(datosApp.ultimaSincro || Date.now()) + '.';
  }

  const totalAbiertas = alertasSinResolver().length;
  const badge = document.getElementById('navBadge');
  badge.hidden = totalAbiertas === 0;
  badge.textContent = totalAbiertas;
}

function etiquetaTarjeta(clave, valor) {
  const estado = evaluarEstado(clave, valor);
  if (estado !== 'ok') {
    const bajo = direccionDesvio(clave, valor) === 'low';
    return {
      cls: estado,
      text: (bajo ? 'Bajo' : 'Alto') + (estado === 'crit' ? ' · crítico' : '')
    };
  }

  if (clave === 'cau') {
    const cambio = variacionCaudal();
    if (cambio != null && cambio <= -cfg.umbralCambioCaudal) {
      return { cls: 'warn', text: '↘ ' + cambio + '% Flujo' };
    }
    if (cambio != null && cambio >= cfg.umbralCambioCaudal) {
      return { cls: 'warn', text: '↗ +' + cambio + '% Flujo' };
    }
  }

  const textosNormal = {
    od: 'Óptimo',
    temp: 'Estable',
    ph: (valor >= 6.8 && valor <= 7.6) ? 'Neutro' : 'Normal',
    cau: 'Estable'
  };
  return { cls: 'ok', text: '✓ ' + textosNormal[clave] };
}

function tiempoTranscurrido(timestamp) {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  return mins < 1 ? 'hace menos de 1 min' : 'hace ' + mins + ' min';
}

function pintarMonitoreo() {
  if (!datosApp.ultimaLectura || !datosApp.perfil) return;

  document.getElementById('monSub').textContent = nombreVeredaCorto() + ' · ' + cfg.especies[datosApp.perfil.especie].nombre;

  const general = estadoMasCritico(datosApp.estados);
  const hero = document.getElementById('overall');
  hero.dataset.status = general;

  document.getElementById('heroLabel').innerHTML = (general === 'ok' ? ICONO_OK : ICONO_ALERTA) + '<span>Estado del Estanque:</span>';
  document.getElementById('heroState').textContent = TITULO_ESTADO[general];
  document.getElementById('syncInfo').textContent = datosApp.conectado
    ? 'Última lectura ' + tiempoTranscurrido(datosApp.ultimaSincro)
    : 'Sin conexión desde las ' + formatoHora12(datosApp.ultimaSincro);

  const badge = document.getElementById('monBadge');
  badge.dataset.status = general;
  badge.innerHTML = general === 'ok' ? ICONO_OK : ICONO_ALERTA;

  const contenedor = document.getElementById('cards');
  contenedor.textContent = '';

  Object.keys(cfg.variables).forEach(function (clave) {
    const valor = datosApp.ultimaLectura[clave];
    const pill = etiquetaTarjeta(clave, valor);
    const tarjeta = crearNodo('div', 'metric');
    tarjeta.dataset.status = evaluarEstado(clave, valor);

    const cabecera = crearNodo('div', 'metric__head');
    cabecera.innerHTML = ICONOS[clave];
    cabecera.appendChild(crearNodo('span', 'metric__name', cfg.variables[clave].tarjeta));
    tarjeta.appendChild(cabecera);

    const cifra = crearNodo('div', 'metric__value', formatearNumero(clave, valor));
    if (cfg.variables[clave].unidad) {
      cifra.appendChild(crearNodo('span', 'metric__unit', cfg.variables[clave].unidad));
    }
    tarjeta.appendChild(cifra);

    tarjeta.appendChild(crearNodo('span', 'pill pill--' + pill.cls, pill.text));
    contenedor.appendChild(tarjeta);
  });

  pintarSugerencia();

  document.getElementById('pendingInfo').textContent = datosApp.pendientes.length
    ? 'El nodo tiene ' + datosApp.pendientes.length + ' lecturas guardadas localmente, pendientes de enviar.'
    : '';
  document.getElementById('btnOffline').textContent = datosApp.conectado ? 'Simular pérdida de señal' : 'Restablecer conexión';
  document.getElementById('btnHypoxia').disabled = datosApp.hipoxia;
}

function pintarSugerencia() {
  const tarjeta = document.getElementById('tipCard');
  const abiertas = alertasSinResolver();
  const cambio = variacionCaudal();
  let titulo = '';
  let texto = '';

  if (abiertas.length) {
    const primera = abiertas[0];
    titulo = 'Atiende la alerta de ' + cfg.variables[primera.key].corto.toLowerCase();
    texto = 'Abre el Centro de alertas para ver qué hacer ahora.';
  } else if (cambio != null && cambio <= -cfg.umbralCambioCaudal) {
    titulo = 'Revisa la bocatoma';
    texto = 'El caudal bajó ' + Math.abs(cambio) + '%. Verifica si hay hojas o sedimentos en la rejilla.';
  } else {
    titulo = 'Todo en orden';
    texto = 'Las lecturas están en rango. Revisa la rejilla en tu ronda diaria.';
  }

  tarjeta.textContent = '';
  tarjeta.appendChild(crearNodo('p', 'tip__eyebrow', 'SUGERENCIA RÁPIDA'));
  tarjeta.appendChild(crearNodo('p', 'tip__title', titulo));
  tarjeta.appendChild(crearNodo('p', 'tip__text', texto));
}

const RANGOS_MS = { '24h': 24 * 3600 * 1000, '7d': 7 * 24 * 3600 * 1000, '30d': 30 * 24 * 3600 * 1000 };
const ETIQUETA_RANGO = { '24h': '24 h', '7d': '7 días', '30d': '30 días' };

function promediarPorBloques(datos, inicio, fin, cantidad) {
  const ancho = (fin - inicio) / cantidad;
  const sumas = new Array(cantidad).fill(0);
  const conteos = new Array(cantidad).fill(0);

  datos.forEach(function (punto) {
    let idx = Math.floor((punto.t - inicio) / ancho);
    if (idx < 0) idx = 0;
    if (idx >= cantidad) idx = cantidad - 1;
    sumas[idx] += punto.v;
    conteos[idx]++;
  });

  const resultado = [];
  for (let i = 0; i < cantidad; i++) {
    if (conteos[i]) {
      resultado.push({
        t: inicio + ancho * (i + 0.5),
        v: sumas[i] / conteos[i]
      });
    }
  }
  return resultado;
}

function marcasEjeY(minimo, maximo, divisiones) {
  const pasoBruto = (maximo - minimo) / divisiones;
  const potencia = Math.pow(10, Math.floor(Math.log10(pasoBruto)));
  const rel = pasoBruto / potencia;
  const mult = rel < 1.5 ? 1 : rel < 3 ? 2 : rel < 7 ? 5 : 10;
  const paso = mult * potencia;

  const marcas = [];
  for (let v = Math.ceil(minimo / paso) * paso; v <= maximo + 1e-9; v += paso) {
    marcas.push(+v.toFixed(6));
  }
  return marcas;
}

function pintarHistorial() {
  if (!datosApp.perfil || !datosApp.historial.length) return;

  const clave = datosApp.variableActiva;
  const infoVar = cfg.variables[clave];
  const rango = rangosVariable(clave);
  const fin = Date.now();
  const inicio = fin - RANGOS_MS[datosApp.rangoTiempo];

  const filtrados = datosApp.historial
    .filter(function (p) { return p.t >= inicio; })
    .map(function (p) { return { t: p.t, v: p[clave] }; });

  if (!filtrados.length) return;

  const puntos = promediarPorBloques(filtrados, inicio, fin, datosApp.rangoTiempo === '24h' ? 48 : 90);

  document.getElementById('hisSub').textContent = nombreVeredaCorto() + ' · Tendencias del estanque';
  document.getElementById('chartTitle').textContent = datosApp.rangoTiempo === '24h' ? 'Evolución horaria' : 'Evolución diaria';
  document.getElementById('chartSub').textContent = datosApp.rangoTiempo === '24h'
    ? fechaCorta(inicio) + ', ' + horaDosDigitos(inicio) + ' h – ' + fechaCorta(fin) + ', ' + horaDosDigitos(fin) + ' h'
    : fechaCorta(inicio) + ' – ' + fechaCorta(fin);

  const leyenda = [];
  if (rango.ok[0] != null) leyenda.push('Umbral mínimo: ' + rango.ok[0].toFixed(infoVar.decimales) + unidadConEspacio(clave));
  if (rango.ok[1] != null) leyenda.push('Umbral máximo: ' + rango.ok[1].toFixed(infoVar.decimales) + unidadConEspacio(clave));
  document.getElementById('chartLegend').textContent = leyenda.length ? '-- ' + leyenda.join(' · ') : '';

  // Dimensiones del lienzo SVG
  const ancho = 340, alto = 190, izq = 38, der = 10, arr = 10, abj = 26;
  const valores = puntos.map(function (p) { return p.v; });
  let minY = Math.min.apply(null, valores);
  let maxY = Math.max.apply(null, valores);

  if (rango.ok[0] != null) minY = Math.min(minY, rango.ok[0]);
  if (rango.ok[1] != null) maxY = Math.max(maxY, rango.ok[1]);

  const margen = ((maxY - minY) || 1) * 0.08;
  minY -= margen;
  maxY += margen;

  function posX(t) {
    return izq + ((t - inicio) / (fin - inicio)) * (ancho - izq - der);
  }
  function posY(v) {
    return arr + (1 - (v - minY) / (maxY - minY)) * (alto - arr - abj);
  }

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + ancho + ' ' + alto);

  function agregarSvg(etiqueta, attrs, texto) {
    const elSvg = document.createElementNS(ns, etiqueta);
    Object.keys(attrs).forEach(function (k) {
      elSvg.setAttribute(k, attrs[k]);
    });
    if (texto != null) elSvg.textContent = texto;
    svg.appendChild(elSvg);
  }

  marcasEjeY(minY, maxY, 3).forEach(function (v) {
    agregarSvg('line', { x1: izq, x2: ancho - der, y1: posY(v), y2: posY(v), 'class': 'grid' });
    agregarSvg('text', { x: izq - 6, y: posY(v) + 4, 'text-anchor': 'end' }, v.toFixed(infoVar.decimales));
  });

  for (let k = 0; k <= 4; k++) {
    const tMarca = inicio + ((fin - inicio) * k) / 4;
    const textoX = datosApp.rangoTiempo === '24h' ? horaDosDigitos(tMarca) + ' h' : fechaCorta(tMarca);
    const ancla = k === 0 ? 'start' : (k === 4 ? 'end' : 'middle');
    agregarSvg('text', { x: posX(tMarca), y: alto - 8, 'text-anchor': ancla }, textoX);
  }

  [rango.ok[0], rango.ok[1]].forEach(function (limite) {
    if (limite != null) {
      agregarSvg('line', { x1: izq, x2: ancho - der, y1: posY(limite), y2: posY(limite), 'class': 'limit' });
    }
  });

  const trazo = puntos.map(function (p, idx) {
    return (idx ? 'L' : 'M') + posX(p.t).toFixed(1) + ' ' + posY(p.v).toFixed(1);
  }).join(' ');

  const ultimo = puntos[puntos.length - 1];
  agregarSvg('path', {
    d: trazo + ' L' + posX(ultimo.t).toFixed(1) + ' ' + (alto - abj) + ' L' + posX(puntos[0].t).toFixed(1) + ' ' + (alto - abj) + ' Z',
    'class': 'area'
  });
  agregarSvg('path', { d: trazo, 'class': 'line' });
  agregarSvg('circle', { cx: posX(ultimo.t), cy: posY(ultimo.v), r: 4.5, 'class': 'dot' });

  const cajaGrafica = document.getElementById('chart');
  cajaGrafica.textContent = '';
  cajaGrafica.appendChild(svg);

  // Resumen debajo de la gráfica
  const crudos = filtrados.map(function (p) { return p.v; });
  const minVal = Math.min.apply(null, crudos);
  const maxVal = Math.max.apply(null, crudos);
  const fuera = crudos.filter(function (v) { return !dentroDeRango(v, rango.ok); }).length;

  let peorPeriodo = 'ok';
  crudos.forEach(function (v) {
    const st = evaluarEstado(clave, v);
    if (PESO_ESTADO[st] > PESO_ESTADO[peorPeriodo]) peorPeriodo = st;
  });

  const resumen = document.getElementById('summary');
  resumen.dataset.status = peorPeriodo;
  resumen.textContent = '';
  resumen.appendChild(crearNodo('p', 'summary__eyebrow', 'RESUMEN ANALÍTICO'));
  resumen.appendChild(crearNodo('p', 'summary__title',
    infoVar.corto + (peorPeriodo === 'ok' ? ' en rango seguro' : peorPeriodo === 'warn' ? ' con episodios de precaución' : ' con episodios críticos')
  ));
  resumen.appendChild(crearNodo('p', 'summary__line summary__line--strong',
    'Mín. ' + formatearNumero(clave, minVal) + ' · Máx. ' + formatearNumero(clave, maxVal) + unidadConEspacio(clave)
  ));

  const textoFuera = rango.ok[1] == null ? 'bajo el umbral' : 'fuera del umbral';
  resumen.appendChild(crearNodo('p', 'summary__line', fuera === 0
    ? 'Sin lecturas ' + textoFuera + ' en ' + ETIQUETA_RANGO[datosApp.rangoTiempo] + '.'
    : Math.round((fuera / crudos.length) * 100) + ' % de las lecturas estuvo ' + textoFuera + ' en ' + ETIQUETA_RANGO[datosApp.rangoTiempo] + '.'
  ));
}

function pintarAlertas() {
  const abiertas = alertasSinResolver();
  const contenedor = document.getElementById('activeAlert');
  contenedor.textContent = '';

  document.getElementById('aleSub').textContent = (datosApp.perfil ? nombreVeredaCorto() + ' · ' : '') +
    (abiertas.length ? abiertas.length + (abiertas.length === 1 ? ' alerta por atender' : ' alertas por atender') : 'Sin alertas por atender');

  if (!abiertas.length) {
    const cajaOk = crearNodo('div', 'alert alert--none');
    cajaOk.appendChild(crearNodo('p', 'alert__top', 'Todo en orden'));
    cajaOk.appendChild(crearNodo('p', 'alert__msg', 'Las cuatro variables están dentro del rango normal para tu especie.'));
    contenedor.appendChild(cajaOk);
  } else {
    const alerta = abiertas.slice().sort(function (a, b) {
      return PESO_ESTADO[b.status] - PESO_ESTADO[a.status] || b.t - a.t;
    })[0];
    const infoVar = cfg.variables[alerta.key];

    const tarjeta = crearNodo('div', 'alert' + (alerta.status === 'warn' ? ' alert--warn' : ''));
    const cabecera = crearNodo('p', 'alert__top');
    cabecera.innerHTML = ICONO_ALERTA;
    cabecera.appendChild(crearNodo('span', null, alerta.status === 'crit' ? 'ALERTA CRÍTICA' : 'PRECAUCIÓN'));
    tarjeta.appendChild(cabecera);

    tarjeta.appendChild(crearNodo('p', 'alert__msg', infoVar.nombre + (alerta.dir === 'low' ? ' descendió a' : ' subió a')));

    const valorGrande = crearNodo('p', 'alert__big', formatearNumero(alerta.key, alerta.value));
    if (infoVar.unidad) valorGrande.appendChild(crearNodo('span', 'alert__unit', infoVar.unidad));
    tarjeta.appendChild(valorGrande);

    tarjeta.appendChild(crearNodo('p', 'alert__meta', formatoHora12(alerta.t) + ' · ' + etiquetaFecha(alerta.t)));
    tarjeta.appendChild(crearNodo('p', 'alert__meta', alerta.dir === 'low'
      ? 'Por debajo del mínimo de ' + alerta.limit[0].toFixed(infoVar.decimales) + unidadConEspacio(alerta.key)
      : 'Por encima del máximo de ' + alerta.limit[1].toFixed(infoVar.decimales) + unidadConEspacio(alerta.key)
    ));
    contenedor.appendChild(tarjeta);

    contenedor.appendChild(crearNodo('h2', 'section-title', 'Acciones recomendadas'));
    accionesSugeridas(alerta.key, alerta.dir).forEach(function (item, idx) {
      const bloque = crearNodo('div', 'rec');
      bloque.appendChild(crearNodo('p', 'rec__prio', 'PRIORIDAD ' + (idx + 1) + ' · ' + item[0]));
      bloque.appendChild(crearNodo('p', 'rec__text', (idx + 1) + '. ' + item[1]));
      contenedor.appendChild(bloque);
    });

    contenedor.appendChild(crearNodo('p', 'foot', 'Verifica ' + TEXTO_VERIFICAR[alerta.key] + ' después de actuar.'));

    const btnVolver = crearNodo('button', 'btn btn--blue', 'Ver monitoreo en tiempo real');
    btnVolver.type = 'button';
    btnVolver.addEventListener('click', function () {
      mostrarPantalla('monitoreo');
    });
    contenedor.appendChild(btnVolver);
  }

  const lista = document.getElementById('alertList');
  lista.textContent = '';
  if (!datosApp.alertas.length) {
    lista.appendChild(crearNodo('li', 'alist__empty', 'Todavía no se han emitido alertas.'));
  }

  datosApp.alertas.forEach(function (alerta) {
    const infoVar = cfg.variables[alerta.key];
    const li = crearNodo('li');
    li.dataset.status = alerta.status;
    li.dataset.resolved = String(alerta.resolved);
    li.appendChild(crearNodo('strong', null, infoVar.nombre + (alerta.dir === 'low' ? ' bajo: ' : ' alto: ') + formatearNumero(alerta.key, alerta.value) + unidadConEspacio(alerta.key)));
    li.appendChild(crearNodo('span', null, etiquetaFecha(alerta.t) + ', ' + formatoHora12(alerta.t) + ' · ' + (alerta.status === 'crit' ? 'Crítica' : 'Precaución') + (alerta.resolved ? ' · Resuelta' : '')));
    lista.appendChild(li);
  });
}

function pintarAsistente() {
  if (!datosApp.perfil || !datosApp.ultimaLectura) return;

  const hace7Dias = Date.now() - 7 * 24 * 3600 * 1000;
  const semana = datosApp.historial.filter(function (p) { return p.t >= hace7Dias; });
  const valoresOd = semana.map(function (p) { return p.od; });
  const odMin = Math.min.apply(null, valoresOd);
  const odMax = Math.max.apply(null, valoresOd);
  const minPermitido = rangosVariable('od').ok[0];
  const odEnRango = odMin >= (minPermitido == null ? -Infinity : minPermitido);

  const cambio = variacionCaudal();
  let textoTendencia = 'Estable';
  if (cambio != null && cambio <= -5) textoTendencia = 'Bajó ' + Math.abs(cambio) + '%';
  else if (cambio != null && cambio >= 5) textoTendencia = 'Subió ' + cambio + '%';

  const analisis = document.getElementById('analysis');
  analisis.textContent = '';
  analisis.appendChild(crearNodo('p', 'analysis__eyebrow', 'ANÁLISIS · ÚLTIMOS 7 DÍAS'));
  analisis.appendChild(crearNodo('p', 'analysis__title', 'Cuida el agua, prevén fallas'));
  analisis.appendChild(crearNodo('p', 'analysis__line', 'Caudal: ' + formatearNumero('cau', datosApp.ultimaLectura.cau) + ' L/min · ' + textoTendencia));
  analisis.appendChild(crearNodo('p', 'analysis__line', 'Oxígeno: ' + odMin.toFixed(1) + '–' + odMax.toFixed(1) + ' mg/L · ' + (odEnRango ? 'En rango' : 'Con episodios bajos')));

  const hayCritico = estadoMasCritico(datosApp.estados) === 'crit';
  const requiereAccion = hayCritico || (cambio != null && cambio <= -cfg.umbralCambioCaudal);

  let textoRecambio = 'El caudal está estable. Mantén el recambio habitual y revisa el oxígeno a primera hora.';
  if (hayCritico) {
    textoRecambio = 'Hay una alerta crítica. Sigue primero las acciones del Centro de alertas y luego define el recambio con apoyo técnico.';
  } else if (requiereAccion) {
    textoRecambio = 'Primero limpia la entrada de agua. Si el caudal no mejora, ajusta el recambio con apoyo técnico.';
  }

  const pasos = document.getElementById('steps');
  pasos.textContent = '';

  [
    {
      badge: requiereAccion ? 'HOY' : 'SEGUIMIENTO',
      cls: requiereAccion ? 'warn' : 'ok',
      titulo: '1. Recambio de agua',
      texto: textoRecambio
    },
    {
      badge: 'REVISIÓN DIARIA',
      cls: 'ok',
      titulo: '2. Mantenimiento del estanque',
      texto: 'Retira hojas de la rejilla y revisa la salida del estanque. Registra la limpieza y vuelve a medir el caudal.'
    }
  ].forEach(function (paso) {
    const tarjeta = crearNodo('article', 'step');
    tarjeta.appendChild(crearNodo('p', 'step__badge step__badge--' + paso.cls, paso.badge));
    tarjeta.appendChild(crearNodo('h2', 'step__title', paso.titulo));
    tarjeta.appendChild(crearNodo('p', 'step__text', paso.texto));
    pasos.appendChild(tarjeta);
  });

  document.getElementById('astFoot').textContent = nombreVeredaCorto() + ' · ' + cfg.especies[datosApp.perfil.especie].nombre + '. Datos de ejemplo para esta interfaz.';
  const ultimoMant = datosApp.mantenimientos[0];
  document.getElementById('lastLog').textContent = ultimoMant ? 'Último registro: ' + etiquetaFecha(ultimoMant) + ', ' + formatoHora12(ultimoMant) + '.' : '';
}

function actualizarVista() {
  pintarBarraSuperior();
  if (!datosApp.perfil) return;
  pintarMonitoreo();
  if (datosApp.pantallaActual === 'historial') pintarHistorial();
  if (datosApp.pantallaActual === 'alertas') pintarAlertas();
  if (datosApp.pantallaActual === 'asistente') pintarAsistente();
}

function mostrarPantalla(nombre) {
  if (nombre !== 'predio' && !datosApp.perfil) {
    mostrarAviso('Primero configura tu estanque');
    nombre = 'predio';
  }
  datosApp.pantallaActual = nombre;

  document.querySelectorAll('.screen').forEach(function (sec) {
    sec.hidden = sec.id !== 'screen-' + nombre;
  });

  const botonActivo = MENU_ACTIVO[nombre] || nombre;
  document.querySelectorAll('.nav__btn').forEach(function (btn) {
    btn.classList.toggle('is-active', btn.dataset.target === botonActivo);
  });

  const main = document.querySelector('main');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
  actualizarVista();
}

function iniciarMonitoreo() {
  datosApp.historial = simulador.crearHistorial(datosApp.perfil.especie);
  datosApp.ultimaLectura = datosApp.historial[datosApp.historial.length - 1];
  datosApp.ultimaSincro = datosApp.ultimaLectura.t;
  datosApp.pendientes = [];
  datosApp.ultimaNodo = null;
  datosApp.conectado = true;
  datosApp.hipoxia = false;
  datosApp.estados = {};

  Object.keys(cfg.variables).forEach(function (clave) {
    datosApp.estados[clave] = evaluarEstado(clave, datosApp.ultimaLectura[clave]);
  });

  clearInterval(datosApp.temporizador);
  datosApp.temporizador = setInterval(cicloMonitoreo, cfg.intervaloMs);
}

function prepararFormulario() {
  const form = document.getElementById('predioForm');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const productor = document.getElementById('productor').value.trim();
    const vereda = document.getElementById('vereda').value.trim();
    const nodo = document.getElementById('nodo').value.trim();
    const especie = form.elements.especie.value;
    const error = document.getElementById('formError');

    if (!productor || !vereda || !nodo) {
      error.textContent = 'Completa el nombre, la vereda y el ID del nodo.';
      error.hidden = false;
      return;
    }
    if (!document.getElementById('consent').checked) {
      error.textContent = 'Para continuar, autoriza el tratamiento de tus datos.';
      error.hidden = false;
      return;
    }
    error.hidden = true;

    const cambioEspecie = !datosApp.perfil || datosApp.perfil.especie !== especie;
    datosApp.perfil = { productor, vereda, especie, nodo, consent: true };

    if (cambioEspecie || !datosApp.historial.length) {
      datosApp.alertas = [];
      iniciarMonitoreo();
    }

    guardarDatos();
    mostrarAviso('Estanque guardado');
    mostrarPantalla('monitoreo');
  });

  document.getElementById('btnPrivacy').addEventListener('click', function () {
    const dialogo = document.getElementById('privacy');
    if (dialogo.showModal) dialogo.showModal();
    else dialogo.setAttribute('open', '');
  });
}

function prepararEventos() {
  document.querySelectorAll('.nav__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      mostrarPantalla(btn.dataset.target);
    });
  });

  const selectorVar = document.getElementById('varSelect');
  Object.keys(cfg.variables).forEach(function (clave) {
    const opcion = crearNodo('option', null, cfg.variables[clave].nombre + unidadConEspacio(clave));
    opcion.value = clave;
    selectorVar.appendChild(opcion);
  });
  selectorVar.addEventListener('change', function () {
    datosApp.variableActiva = selectorVar.value;
    pintarHistorial();
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      datosApp.rangoTiempo = tab.dataset.range;
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      pintarHistorial();
    });
  });

  document.getElementById('tipCard').addEventListener('click', function () {
    mostrarPantalla(alertasSinResolver().length ? 'alertas' : 'asistente');
  });

  document.getElementById('btnToAsistente').addEventListener('click', function () {
    mostrarPantalla('asistente');
  });

  document.getElementById('btnLog').addEventListener('click', function () {
    datosApp.mantenimientos.unshift(Date.now());
    if (datosApp.mantenimientos.length > cfg.maxMantenimientos) {
      datosApp.mantenimientos.length = cfg.maxMantenimientos;
    }
    guardarDatos();
    mostrarAviso('Mantenimiento registrado');
    pintarAsistente();
  });

  document.getElementById('btnHypoxia').addEventListener('click', function () {
    datosApp.hipoxia = true;
    mostrarAviso('Simulando caída de oxígeno…');
    pintarMonitoreo();
  });

  document.getElementById('btnOffline').addEventListener('click', function () {
    cambiarEstadoRed(!datosApp.conectado);
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    datosApp.hipoxia = false;
    mostrarAviso('Valores volviendo a la normalidad');
    pintarMonitoreo();
  });
}

function actualizarReloj() {
  const ahora = new Date();
  document.getElementById('clock').textContent = dosDigitos(ahora.getHours()) + ':' + dosDigitos(ahora.getMinutes());
}

function iniciarAplicacion() {
  prepararFormulario();
  prepararEventos();
  actualizarReloj();
  setInterval(actualizarReloj, 30000);

  const guardado = cargarDatos();
  if (guardado && guardado.perfil) {
    datosApp.perfil = guardado.perfil;
    datosApp.alertas = guardado.alertas || [];
    datosApp.mantenimientos = guardado.mantenimientos || [];

    document.getElementById('productor').value = guardado.perfil.productor;
    document.getElementById('vereda').value = guardado.perfil.vereda;
    document.getElementById('nodo').value = guardado.perfil.nodo;
    document.getElementById('consent').checked = true;

    const radio = document.querySelector('input[name="especie"][value="' + guardado.perfil.especie + '"]');
    if (radio) radio.checked = true;

    iniciarMonitoreo();
    mostrarPantalla('monitoreo');
  } else {
    mostrarPantalla('predio');
  }
}

document.addEventListener('DOMContentLoaded', iniciarAplicacion);