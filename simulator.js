/* Acuasmart Rural 
   Genera lecturas de oxígeno, temperatura, pH y caudal para demostrar el
   prototipo sin hardwar
(function () {
  'use strict';

  var C = window.ACUA_CONFIG;

  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function round(v, d) {
    var f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  // Historial sintético: ciclo diario (el oxígeno baja de madrugada) + eventos de lluvia
  function createHistory(speciesKey) {
    var base = C.species[speciesKey].base;
    var rand = seeded(speciesKey === 'trucha' ? 1234 : 5678);
    var now = Date.now();
    var out = [];
    var rain = 0;

    for (var i = C.historyHours - 1; i >= 0; i--) {
      var t = now - i * 3600 * 1000;
      var hour = new Date(t).getHours();
      var cycle = Math.cos((2 * Math.PI * (hour - 15)) / 24);

      if (rand() < 0.012) rain = 1;   // inicia una lluvia
      rain *= 0.93;                   // y decae con las horas

      out.push({
        t: t,
        od:   round(base.od   + 0.5 * cycle - 0.15 * rain + (rand() - 0.5) * 0.2, 2),
        temp: round(base.temp + 1.2 * cycle - 0.8 * rain  + (rand() - 0.5) * 0.3, 2),
        ph:   round(base.ph   + 0.12 * cycle - 0.1 * rain + (rand() - 0.5) * 0.08, 2),
        cau: round(base.cau * C.CauHisFactor * (1 + 0.35 * rain) + (rand() - 0.5) * 1.5, 1)
      });
    }
    // La lectura más reciente parte del caudal actual (sin efecto de lluvia)
    out[out.length - 1].cau = base.cau;
    return out;
  }

  // Siguiente lectura en vivo: 
  function next(prev, speciesKey, hipoxia) {
    var base = C.species[speciesKey].base;
    var target = {
      od: hipoxia ? C.oxiTarget[speciesKey] : base.od,
      temp: base.temp, ph: base.ph, cau: base.cau
    };
    function step(key, k, noise) {
      return prev[key] + (target[key] - prev[key]) * k + (Math.random() - 0.5) * noise;
    }
    return {
      t: Date.now(),
      od:   round(step('od', hypoxia ? 0.22 : 0.12, 0.10), 2),
      temp: round(step('temp', 0.08, 0.12), 2),
      ph:   round(step('ph', 0.08, 0.04), 2),
      cau: round(step('cau', 0.10, 0.5), 1)
    };
  }

  window.AcuaSim = { createHistory: createHistory, next: next };
})();
