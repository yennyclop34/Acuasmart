// Simulador de lecturas del nodo ESP32

const cfgSim = window.ACUA_CONFIG;

function generadorSemilla(semilla) {
  let s = semilla >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function redondear(valor, decimales) {
  const factor = Math.pow(10, decimales);
  return Math.round(valor * factor) / factor;
}

// Genera el historial hacia atrás simulando ciclo diario y lluvias
function crearHistorial(especie) {
  const base = cfgSim.especies[especie].base;
  const random = generadorSemilla(especie === 'trucha' ? 1234 : 5678);
  const ahora = Date.now();
  const historial = [];
  let lluvia = 0;

  for (let i = cfgSim.horasHistorial - 1; i >= 0; i--) {
    const tiempo = ahora - i * 3600 * 1000;
    const hora = new Date(tiempo).getHours();
    const ciclo = Math.cos((2 * Math.PI * (hora - 15)) / 24);

    if (random() < 0.012) {
      lluvia = 1;
    }
    lluvia *= 0.93;

    historial.push({
      t: tiempo,
      od:   redondear(base.od   + 0.5 * ciclo - 0.15 * lluvia + (random() - 0.5) * 0.2, 2),
      temp: redondear(base.temp + 1.2 * ciclo - 0.8 * lluvia  + (random() - 0.5) * 0.3, 2),
      ph:   redondear(base.ph   + 0.12 * ciclo - 0.1 * lluvia + (random() - 0.5) * 0.08, 2),
      cau:  redondear(base.cau * cfgSim.factorCaudalHistorial * (1 + 0.35 * lluvia) + (random() - 0.5) * 1.5, 1)
    });
  }

  historial[historial.length - 1].cau = base.cau;
  return historial;
}

// Calcula la siguiente lectura en vivo
function siguienteLectura(anterior, especie, simularHipoxia) {
  const base = cfgSim.especies[especie].base;
  const metas = {
    od: simularHipoxia ? cfgSim.objetivoHipoxia[especie] : base.od,
    temp: base.temp,
    ph: base.ph,
    cau: base.cau
  };

  function variar(clave, velocidad, ruido) {
    return anterior[clave] + (metas[clave] - anterior[clave]) * velocidad + (Math.random() - 0.5) * ruido;
  }

  return {
    t: Date.now(),
    od:   redondear(variar('od', simularHipoxia ? 0.22 : 0.12, 0.10), 2),
    temp: redondear(variar('temp', 0.08, 0.12), 2),
    ph:   redondear(variar('ph', 0.08, 0.04), 2),
    cau:  redondear(variar('cau', 0.10, 0.5), 1)
  };
}

window.AcuaSim = {
  crearHistorial,
  siguienteLectura
};