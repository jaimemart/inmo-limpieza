import { DEMO_HOUSES } from './config.mjs';

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseCents(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Introduce un importe entre 0,01 y 9.999,99 € con un máximo de dos decimales.');
  const [whole, decimal = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (cents <= 0) throw new Error('El importe debe ser mayor que cero.');
  return cents;
}

export function parseMinutes(value) {
  if (!/^\d{1,3}$/.test(String(value)) || Number(value) < 1 || Number(value) > 240) {
    throw new Error('Introduce entre 1 y 240 minutos, sin decimales.');
  }
  return Number(value);
}

export function durationMinutes(session, now = Date.now()) {
  return Math.max(0, Math.floor(((session.end ? Date.parse(session.end) : now) - Date.parse(session.start)) / 60000));
}

export function activeSession(state) {
  return state.sessions.find(session => !session.end);
}

export function startSession(state, houseId, now = new Date(), id = crypto.randomUUID()) {
  if (!DEMO_HOUSES.some(house => house.id === houseId)) throw new Error('Selecciona una vivienda válida.');
  if (activeSession(state)) throw new Error('Ya tienes una jornada en curso. Registra la salida antes de empezar otra.');
  return { ...state, selectedHouse: houseId, sessions: [...state.sessions, { id, houseId, start: now.toISOString(), end: null }] };
}

export function endSession(state, now = new Date()) {
  const active = activeSession(state);
  if (!active) throw new Error('No hay ninguna jornada abierta.');
  if (now.getTime() < Date.parse(active.start)) throw new Error('La hora de salida no puede ser anterior a la entrada. Revisa la hora del dispositivo.');
  return { ...state, sessions: state.sessions.map(session => session.id === active.id ? { ...session, end: now.toISOString() } : session) };
}

export function reviewRequest(state, collection, id, status) {
  if (!['expenses', 'extras'].includes(collection) || !['approved', 'rejected'].includes(status)) throw new Error('Revisión no válida.');
  const request = state[collection].find(item => item.id === id);
  if (!request || request.status !== 'pending') throw new Error('Esta solicitud ya se ha revisado o no existe.');
  return { ...state, [collection]: state[collection].map(item => item.id === id ? { ...item, status } : item) };
}

export function validateRequestDate(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Selecciona una fecha válida.');
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime()) || localDate(date) !== value || value > localDate(now)) throw new Error('La fecha debe ser válida y no puede estar en el futuro.');
  return value;
}

export function seedState(now = new Date()) {
  const previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  previous.setHours(9, 0, 0, 0);
  const end = new Date(previous);
  end.setHours(11, 15);
  const date = localDate(previous);
  return {
    version: 1,
    selectedHouse: 'olivo',
    sessions: [{ id: 'example-session', houseId: 'olivo', start: previous.toISOString(), end: end.toISOString(), example: true }],
    expenses: [{ id: 'example-expense', houseId: 'olivo', date, cents: 1240, description: 'Productos de limpieza', status: 'pending', receipt: null, example: true }],
    extras: [{ id: 'example-extra', houseId: 'olivo', date, minutes: 20, description: 'Compra de productos antes de la entrada', status: 'pending', example: true }],
  };
}

// Validate persisted browser data before rendering or applying a mutation.
export function validateState(state) {
  if (!state || state.version !== 1 || !DEMO_HOUSES.some(h => h.id === state.selectedHouse)) return false;
  const houseValid = item => item && typeof item.id === 'string' && DEMO_HOUSES.some(h => h.id === item.houseId);
  const dateValid = value => {
    try { validateRequestDate(value); return true; } catch { return false; }
  };
  if (!Array.isArray(state.sessions) || !Array.isArray(state.expenses) || !Array.isArray(state.extras)) return false;
  if (!state.sessions.every(s => houseValid(s) && Number.isFinite(Date.parse(s.start)) && (s.end === null || (Number.isFinite(Date.parse(s.end)) && Date.parse(s.end) >= Date.parse(s.start))))) return false;
  if (state.sessions.filter(s => !s.end).length > 1) return false;
  const requestValid = item => houseValid(item) && dateValid(item.date) && typeof item.description === 'string' && item.description.length <= 240 && ['pending', 'approved', 'rejected'].includes(item.status);
  const receiptValid = receipt => receipt === null || (
    typeof receipt?.data === 'string'
    && /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(receipt.data)
    && receipt.data.length < 2900000
    && typeof receipt.name === 'string'
  );
  if (!state.expenses.every(e => requestValid(e) && Number.isInteger(e.cents) && e.cents > 0 && e.cents <= 999999 && receiptValid(e.receipt))) return false;
  if (!state.extras.every(e => requestValid(e) && Number.isInteger(e.minutes) && e.minutes >= 1 && e.minutes <= 240)) return false;
  for (const collection of ['sessions', 'expenses', 'extras']) {
    if (new Set(state[collection].map(item => item.id)).size !== state[collection].length) return false;
  }
  return true;
}
