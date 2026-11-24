// Simulador de datos del nodo ESP32 para pruebas sin sensores físicos

var cfg = window.ACUA_CONFIG;

function aleatorioConSemilla(semilla) {
    var num = semilla >>> 0;
    return function () {
      num = (num * 1664525 + 1013904223) >>> 0;
      return num / 4294967296;
    };
}

function redondear(valor, decimales) {
  var factor = Math.pow(10, decimales);
    return Math.round(valor * factor) / factor;
}

// Genera datos hacia atrás simulando el día, la noche y lluvias
function crearHistorial(especie) {
  var base = cfg.species[especie].base;
  var azar = aleatorioConSemilla(especie === 'trucha' ? 1234 : 5678);
  var ahora = Date.now();
  var datos = [];
  var lluvia = 0;

  for (var i = cfg.historyHours - 1; i >= 0; i--) {
      var tiempo = ahora - i * 3600 * 1000;
      var hora = new Date(tiempo).getHours();
      var ciclo = Math.cos((2 * Math.PI * (hora - 15)) / 24);

    if (azar() < 0.012) {
        lluvia = 1;
    }
      lluvia = lluvia * 0.93;

      datos.push({
        t: tiempo,
        od: redondear(base.od + 0.5 * ciclo - 0.15 * lluvia + (azar() - 0.5) * 0.2, 2),
        temp: redondear(base.temp + 1.2 * ciclo - 0.8 * lluvia + (azar() - 0.5) * 0.3, 2),
        ph: redondear(base.ph + 0.12 * ciclo - 0.1 * lluvia + (azar() - 0.5) * 0.08, 2),
        cau: redondear(base.flow * cfg.flowHistoryFactor * (1 + 0.35 * lluvia) + (azar() - 0.5) * 1.5, 1)
      });
  }

  // El último dato arranca con el caudal normal actual
  datos[datos.length - 1].flow = base.flow;
  return datos;
}

// Calcula la siguiente lectura cada vez que pasa el tiempo
function siguienteLectura(anterior, especie, bajaOxigeno) {
    var base = cfg.species[especie].base;
    var objetivoOd = bajaOxigeno ? cfg.hypoxiaTarget[especie] : base.od;

  function calcularCambio(campo, meta, ajuste, ruido) {
    return anterior[campo] + (meta - anterior[campo]) * ajuste + (Math.random() - 0.5) * ruido;
  }

  return {
    t: Date.now(),
    od: redondear(calcularCambio('od', objetivoOd, bajaOxigeno ? 0.22 : 0.12, 0.10), 2),
    temp: redondear(calcularCambio('temp', base.temp, 0.08, 0.12), 2),
      ph: redondear(calcularCambio('ph', base.ph, 0.08, 0.04), 2),
      cau: redondear(calcularCambio('flow', base.flow, 0.10, 0.5), 1)
  };
}

window.AcuaSim = {
  createHistory: crearHistorial,
  next: siguienteLectura
};
