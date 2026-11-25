// Parámetros y rangos por especie - Acuasmart Rural

window.ACUA_CONFIG = {
  intervaloMs: 3000,
  horasHistorial: 720,
  maxPuntosHistorial: 4000,
  maxAlertas: 50,
  maxMantenimientos: 30,
  factorCaudalHistorial: 1.06,
  umbralCambioCaudal: 10,

  objetivoHipoxia: {
    trucha: 4.6,
    mojarra: 3.0
  },

  variables: {
    od: {
      nombre: 'Oxígeno disuelto',
      corto: 'Oxígeno',
      tarjeta: 'Oxígeno Disuelto',
      unidad: 'mg/L',
      decimales: 1
    },
    temp: {
      nombre: 'Temperatura',
      corto: 'Temperatura',
      tarjeta: 'Temperatura del Agua',
      unidad: '°C',
      decimales: 1
    },
    ph: {
      nombre: 'pH',
      corto: 'pH',
      tarjeta: 'Nivel de pH',
      unidad: '',
      decimales: 1
    },
    cau: {
      nombre: 'Caudal de ingreso',
      corto: 'Caudal',
      tarjeta: 'Caudal de Ingreso',
      unidad: 'L/min',
      decimales: 1
    }
  },

  especies: {
    trucha: {
      nombre: 'Trucha Arcoíris',
      base: { od: 6.8, temp: 14.2, ph: 7.2, cau: 18.5 },
      rangos: {
        od:   { ok: [6.0, null], warn: [5.5, null] },
        temp: { ok: [9, 16],     warn: [7, 18] },
        ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
        cau:  { ok: [10, 120],   warn: [5, 150] }
      }
    },
    mojarra: {
      nombre: 'Mojarra',
      base: { od: 6.2, temp: 27, ph: 7.6, cau: 32 },
      rangos: {
        od:   { ok: [5.0, null], warn: [3.5, null] },
        temp: { ok: [24, 30],    warn: [20, 32] },
        ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
        cau:  { ok: [10, 100],   warn: [5, 130] }
      }
    }
  }
};