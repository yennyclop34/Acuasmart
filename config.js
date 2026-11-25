// Configuración de variables y rangos por especie - Acuasmart Rural

window.ACUA_CONFIG = {
  tickMs: 4000,
  historyHours: 720,
  maxHistoryPoints: 900,
  maxAlerts: 20,
  maxMaintenance: 15,
  flowHistoryFactor: 1.06,
  flowTrendThreshold: 15,

  hypoxiaTarget: {
    trucha: 4.2,
    mojarra: 3.4
  },

  vars: {
    od: {
      label: 'Oxígeno disuelto',
      short: 'Oxígeno',
      card: 'Oxígeno Disuelto',
      unit: 'mg/L',
      decimals: 1
    },
    temp: {
      label: 'Temperatura del agua',
      short: 'Temperatura',
      card: 'Temperatura del Agua',
      unit: '°C',
      decimals: 1
    },
    ph: {
      label: 'Nivel de pH',
      short: 'pH',
      card: 'Nivel de pH',
      unit: '',
      decimals: 1
    },
    flow: {
      label: 'Caudal de ingreso',
      short: 'Caudal',
      card: 'Caudal de Ingreso',
      unit: 'L/min',
      decimals: 1
    }
  },

  species: {
    trucha: {
      name: 'Trucha Arcoíris',
      base: { od: 7.4, temp: 13.5, ph: 7.2, flow: 45 },
      ranges: {
        od:   { ok: [6.0, null], warn: [5.0, 6.0] },
        temp: { ok: [9.0, 16.0], warn: [7.0, 18.0] },
        ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
        flow: { ok: [10, 120],   warn: [6, 140] }
      }
    },
    mojarra: {
      name: 'Mojarra',
      base: { od: 6.2, temp: 27.0, ph: 7.4, flow: 40 },
      ranges: {
        od:   { ok: [5.0, null], warn: [4.0, 5.0] },
        temp: { ok: [24.0, 30.0], warn: [21.0, 32.0] },
        ph:   { ok: [6.5, 8.5],   warn: [6.0, 9.0] },
        flow: { ok: [10, 100],    warn: [6, 120] }
      }
    }
  }
};
