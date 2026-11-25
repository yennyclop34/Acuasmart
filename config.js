/* Acuasmart Rural · configuración
   Umbrales por especie. Son valores de ejemplo: deben ajustarse con los
   resultados del diagnóstico (Anexo A) y la literatura técnica.
   Formato: [mínimo, máximo]; null = sin límite en ese extremo.
   ok   = rango normal (verde)
   warn = rango de precaución (amarillo); fuera de este rango = crítico (rojo) */
(function () {
  'use strict';

  window.ACUA_CONFIG = {
    vars: {
      od:   { label: 'Oxígeno disuelto',  short: 'Oxígeno',     card: 'Oxígeno Disuelto',     unit: 'mg/L',  decimals: 1 },
      temp: { label: 'Temperatura',       short: 'Temperatura', card: 'Temperatura del Agua', unit: '°C',    decimals: 1 },
      ph:   { label: 'pH',                short: 'pH',          card: 'Nivel de pH',          unit: '',      decimals: 1 },
      flow: { label: 'Caudal de ingreso', short: 'Caudal',      card: 'Caudal de Ingreso',    unit: 'L/min', decimals: 1 }
    },

    species: {
      trucha: {
        name: 'Trucha Arcoíris',
        // El mínimo de oxígeno (6.0) y la alerta crítica en 5.4 mg/L coinciden con el prototipo de Figma
        ranges: {
          od:   { ok: [6.0, null], warn: [5.5, null] },
          temp: { ok: [9, 16],     warn: [7, 18] },
          ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
          flow: { ok: [10, 120],   warn: [5, 150] }
        },
        base: { od: 6.8, temp: 14.2, ph: 7.2, flow: 18.5 }
      },
      mojarra: {
        name: 'Mojarra',
        ranges: {
          od:   { ok: [5.0, null], warn: [3.5, null] },
          temp: { ok: [24, 30],    warn: [20, 32] },
          ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
          flow: { ok: [10, 100],   warn: [5, 130] }
        },
        base: { od: 6.2, temp: 27, ph: 7.6, flow: 32 }
      }
    },

    // Escenario de demostración: el oxígeno cae por debajo del umbral crítico
    hypoxiaTarget: { trucha: 4.6, mojarra: 3.0 },

    // El historial de caudal parte de un nivel algo mayor que el actual,
    // para que el prototipo muestre "el caudal bajó ~15 %" como en Figma.
    flowHistoryFactor: 1.06,
    flowTrendThreshold: 10,   // % de cambio que activa la sugerencia de revisar la bocatoma

    tickMs: 3000,
    historyHours: 720,
    maxHistoryPoints: 4000,
    maxAlerts: 50,
    maxMaintenance: 30
  };
})();
