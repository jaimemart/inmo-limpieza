const madridDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function visitDate(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha de visita no válida.');
  const parts = Object.fromEntries(madridDate.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function visitsFor(sessions, { houseId = '', month = '', limit = null } = {}) {
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes no válido.');
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) throw new Error('Límite de visitas no válido.');
  const visits = sessions
    .filter(session => (!houseId || session.houseId === houseId) && (!month || visitDate(session.start).startsWith(month)))
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  return limit === null ? visits : visits.slice(0, limit);
}
