/* Configuración de Acuasmart Rural */
(function () {
  'use strict';

  window.ACUA_CONFIG = {
    vars: {
      od:   { label: 'Oxigeno disuelto',  short: 'Oxígeno',     card: 'Oxígeno Disuelto',     unit: 'mg/L',  decimals: 1 },
      temp: { label: 'Temperatura',       short: 'Temperatura', card: 'Temperatura del Agua', unit: '°C',    decimals: 1 },
      ph:   { label: 'pH',                short: 'pH',          card: 'Nivel de pH',          unit: '',      decimals: 1 },
      cau: { label: 'Caudal de ingreso', short: 'Caudal',      card: 'Caudal de Ingreso',    unit: 'L/min', decimals: 1 }
    },

    species: {
      trucha: {
        name: 'Trucha Arcoíris',
        ranges: {
          od:   { ok: [6.0, null], warn: [5.5, null] },
          temp: { ok: [9, 16],     warn: [7, 18] },
          ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
          cau: { ok: [10, 120],   warn: [5, 150] }
        },
        base: { od: 6.8, temp: 14.2, ph: 7.2, cau: 18.5 }
      },

      mojarra: {
        name: 'Mojarra',
        ranges: {
          od:   { ok: [5.0, null], warn: [3.5, null] },
          temp: { ok: [24, 30],    warn: [20, 32] },
          ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
          cau: { ok: [10, 100],   warn: [5, 130] }
        },
        base: { od: 6.2, temp: 27, ph: 7.6, cau: 32 }
      }
    },

    // Valores para la prueba
 
oxigenoBajo: { trucha: 4.6, mojarra: 3.0 },

factorCaudal: 1.06,
cambioCaudal: 10,

   tiempoActualizacion: 3000,
horasHistorial: 720,
limiteHistorial: 4000,
limiteAlertas: 50,
limiteMantenimientos: 30
  };
})();
