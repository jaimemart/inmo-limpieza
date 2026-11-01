import { DEMO_HOUSES, STORAGE_KEY } from './config.mjs?v=2';
import { activeSession, durationMinutes, endSession, localDate, parseCents, parseMinutes, reviewRequest, seedState, startSession, validateState } from './model.mjs?v=2';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const euros = cents => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const time = value => new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const readableDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
const duration = minutes => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
const house = id => DEMO_HOUSES.find(item => item.id === id) || DEMO_HOUSES[0];
const statusLabels = { pending: ['amber', 'Pendiente'], approved: ['green', 'Aprobado'], rejected: ['red', 'Rechazado'] };
const statusPill = status => `<span class="pill ${statusLabels[status][0]}">${statusLabels[status][1]}</span>`;
let loadError = '';
let state;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  state = stored ? JSON.parse(stored) : seedState();
  if (!validateState(state)) throw new Error('invalid-state');
  if (!stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
} catch {
  state = seedState();
  loadError = 'No se han podido leer o guardar los datos de prueba. Revisa el almacenamiento del navegador o restablece la demo desde Gestión.';
}

const queryHouse = new URLSearchParams(location.search).get('casa');
if (DEMO_HOUSES.some(item => item.id === queryHouse) && !activeSession(state)) state.selectedHouse = queryHouse;
let activityFilter = 'all';
let managementHouse = 'all';
let managementMonth = 'all';
let toastTimer;
let receipt = null;
let receiptReadToken = 0;
let receiptLoading = false;
let focusBeforeDialog;

function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500);
}

function commit(update, message) {
  try {
    if (loadError) throw new Error(loadError);
    const stored = localStorage.getItem(STORAGE_KEY);
    const latest = stored ? JSON.parse(stored) : state;
    if (!validateState(latest)) throw new Error('Los datos de prueba no son válidos. Restablece la demo desde Gestión.');
    const next = update(latest);
    if (!validateState(next)) throw new Error('No se ha podido validar el registro. Revisa los datos.');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
    render();
    if (message) showToast(message);
    return true;
  } catch (error) {
    const messageText = error.name === 'QuotaExceededError' ? 'El navegador no tiene espacio. Prueba con un ticket más pequeño o restablece la demo.' : error.message;
    if ($('#form-error')) $('#form-error').textContent = messageText;
    else showToast(messageText);
    return false;
  }
}

function currentPage() {
  const page = location.hash.slice(1);
  return ['jornada', 'actividad', 'gestion'].includes(page) ? page : 'jornada';
}

function heading(eyebrow, title, subtitle = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}</div><span class="date-caption">${esc(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</span></div>`;
}

function eventHTML(item) {
  const isSession = item.type === 'session';
  const isExpense = item.type === 'expense';
  const title = isSession ? 'Jornada de limpieza' : item.description;
  const subtitle = isSession ? `${time(item.start)} — ${item.end ? time(item.end) : 'En curso'}` : isExpense ? 'Gasto de limpieza' : 'Tiempo adicional';
  const value = isSession ? duration(durationMinutes(item)) : isExpense ? euros(item.cents) : `+${item.minutes} min`;
  return `<div class="event"><span class="event-icon">${icon(isSession ? 'clock' : isExpense ? 'receipt' : 'plus')}</span><div class="event-content"><div class="event-title">${esc(title)}</div><div class="event-description">${esc(house(item.houseId).name)} · ${esc(subtitle)}</div><div class="event-bottom">${isSession ? (item.end ? '<span class="pill neutral">Finalizada</span>' : '<span class="pill green">En curso</span>') : statusPill(item.status)}${item.example ? '<span class="example-label">Ejemplo</span>' : ''}${isExpense && item.receipt ? `<button class="text-button" data-receipt="${esc(item.id)}">Ver ticket</button>` : ''}</div></div><span class="event-value">${esc(value)}</span></div>`;
}

function allEvents() {
  return [
    ...state.sessions.map(item => ({ ...item, type: 'session', date: localDate(new Date(item.start)), sort: item.start })),
    ...state.expenses.map(item => ({ ...item, type: 'expense', sort: item.createdAt || `${item.date}T12:00:00` })),
    ...state.extras.map(item => ({ ...item, type: 'extra', sort: item.createdAt || `${item.date}T12:01:00` })),
  ].sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.sort) - Date.parse(a.sort));
}

function renderJornada() {
  const active = activeSession(state);
  const selectedId = active?.houseId || state.selectedHouse;
  const latest = state.sessions.filter(item => item.houseId === selectedId).at(-1);
  const selected = DEMO_HOUSES.find(item => item.id === selectedId);
  const stamp = value => `${time(value)}${localDate(new Date(value)) === localDate() ? '' : ` · ${readableDate(localDate(new Date(value)))}`}`;
  return `<h1 class="sr-only">Registro de limpieza</h1>
    <section class="card simple-card" aria-label="Fichaje">
      <label class="simple-label" for="house-select">Vivienda</label>
      <select id="house-select" class="select-input" ${active ? 'disabled' : ''}>
        <option value="" disabled ${!selected ? 'selected' : ''}>Elige una vivienda</option>
        ${DEMO_HOUSES.map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${item.name}</option>`).join('')}
      </select>
      <button id="shift-action" class="button full simple-check" ${!selected ? 'disabled' : ''}>${active ? 'Hacer check-out' : 'Hacer check-in'}</button>
      ${latest ? `<dl class="check-times"><div><dt>Check-in</dt><dd>${esc(stamp(latest.start))}</dd></div>${latest.end ? `<div><dt>Check-out</dt><dd>${esc(stamp(latest.end))}</dd></div>` : ''}</dl><p class="shift-message ${active ? 'in-progress' : ''}">${active ? 'Entrada registrada.' : 'Salida registrada.'}</p>` : '<p class="shift-message">El botón guarda la hora al pulsarlo.</p>'}
    </section>
    <section class="simple-extras" aria-label="Extras">
      <h2>Extras</h2>
      <button id="add-expense" class="button secondary full" ${!selected ? 'disabled' : ''}>Añadir gasto extra</button>
      <button id="add-extra" class="button secondary full" ${!selected ? 'disabled' : ''}>Añadir tiempo extra</button>
    </section>
    <p class="simple-demo-note">Prueba de diseño. El wifi y el envío de datos están pendientes.</p>`;
}

function renderActivity() {
  const events = allEvents().filter(item => activityFilter === 'all' || item.type === activityFilter);
  const dates = [...new Set(events.map(item => item.date))];
  return `${heading('Propietario · Demo', 'Registros.')}<div class="owner-links"><a href="#gestion">Volver a revisión</a><a href="#jornada">Ver pantalla de limpieza</a></div>
    <div class="toolbar"><label class="field-caption" for="activity-filter">Mostrar</label><select id="activity-filter" class="select-input">${[['all', 'Toda la actividad'], ['session', 'Jornadas'], ['expense', 'Gastos'], ['extra', 'Tiempo adicional']].map(([value, label]) => `<option value="${value}" ${activityFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="activity-list">${events.length ? dates.map(date => `<section class="activity-group"><h2 class="group-date">${date === localDate() ? 'Hoy' : esc(readableDate(date))}</h2><div class="card list-card">${events.filter(item => item.date === date).map(eventHTML).join('')}</div></section>`).join('') : `<div class="card empty-card"><div class="empty">${icon('history')}<strong>Aún no hay registros aquí</strong><p>Prueba a registrar una jornada o añadir un gasto.</p></div></div>`}</div>`;
}

function inScope(item, date) {
  return (managementHouse === 'all' || item.houseId === managementHouse) && (managementMonth === 'all' || date.startsWith(managementMonth));
}

function renderManagement() {
  const sessions = state.sessions.filter(item => inScope(item, localDate(new Date(item.start))));
  const expenses = state.expenses.filter(item => inScope(item, item.date));
  const extras = state.extras.filter(item => inScope(item, item.date));
  const pending = [...expenses.filter(item => item.status === 'pending').map(item => ({ ...item, collection: 'expenses' })), ...extras.filter(item => item.status === 'pending').map(item => ({ ...item, collection: 'extras' }))];
  const logged = sessions.reduce((sum, item) => sum + durationMinutes(item), 0);
  const approvedMinutes = extras.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.minutes, 0);
  const pendingCents = expenses.filter(item => item.status === 'pending').reduce((sum, item) => sum + item.cents, 0);
  const approvedCents = expenses.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.cents, 0);
  const months = [...new Set(allEvents().map(item => item.date.slice(0, 7)))].sort().reverse();
  return `${heading('Propietario · Demo', 'Revisión de limpieza.', 'Importes, motivos y tickets para verificar. No se incorporan a la contabilidad.')}<div class="owner-links"><a href="#jornada">Ver pantalla de limpieza</a><a href="#actividad">Ver registros</a></div>
    <div class="notice">Demo local: aquí solo ves las pruebas de este navegador. El envío desde el móvil de la limpiadora y tu acceso privado están pendientes.</div>
    <div class="toolbar"><select id="management-house" class="select-input" aria-label="Filtrar por vivienda"><option value="all">Todas las viviendas</option>${DEMO_HOUSES.map(item => `<option value="${item.id}" ${managementHouse === item.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select><select id="management-month" class="select-input" aria-label="Filtrar por mes"><option value="all">Todo el historial</option>${months.map(month => `<option value="${month}" ${managementMonth === month ? 'selected' : ''}>${esc(new Date(`${month}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))}</option>`).join('')}</select><button id="export" class="button secondary">${icon('download')} Exportar CSV</button></div>
    <div class="metrics"><div class="card metric"><p class="metric-label">Tiempo registrado</p><p class="metric-value">${duration(logged)}</p><p class="metric-note">${sessions.filter(item => !item.end).length ? 'Incluye jornada en curso' : 'Según entradas y salidas'}</p></div><div class="card metric"><p class="metric-label">Extras aprobados</p><p class="metric-value">+${approvedMinutes} min</p><p class="metric-note">${extras.filter(item => item.status === 'pending').reduce((sum, item) => sum + item.minutes, 0)} min por revisar</p></div><div class="card metric"><p class="metric-label">Gastos pendientes</p><p class="metric-value">${euros(pendingCents)}</p><p class="metric-note">${euros(approvedCents)} aprobados</p></div></div>
    <div class="management-layout"><section class="card review-card"><div class="section-label"><h2>Pendiente de revisar</h2><span class="pill amber">${pending.length}</span></div>${pending.length ? pending.map(item => `<article class="review-item"><div class="review-top"><span class="event-icon">${icon(item.collection === 'expenses' ? 'receipt' : 'plus')}</span><div class="event-content"><p class="event-title">${esc(item.description)}</p><p class="event-description">${esc(house(item.houseId).name)} · ${esc(readableDate(item.date))}</p><div class="event-bottom">${item.example ? '<span class="example-label">Ejemplo de solicitud</span>' : ''}${item.receipt ? `<button class="text-button" data-receipt="${esc(item.id)}">Ver ticket</button>` : ''}</div></div><strong class="event-value">${item.collection === 'expenses' ? euros(item.cents) : `+${item.minutes} min`}</strong></div><div class="review-actions"><button class="button quiet" data-review="rejected" data-collection="${item.collection}" data-id="${esc(item.id)}">Rechazar</button><button class="button secondary" data-review="approved" data-collection="${item.collection}" data-id="${esc(item.id)}">${icon('check')} Aprobar</button></div></article>`).join('') : `<div class="empty">${icon('check')}<strong>Todo revisado</strong><p>No hay solicitudes pendientes con estos filtros.</p></div>`}</section>
    <section class="card review-card"><h2>Por vivienda</h2>${DEMO_HOUSES.filter(item => managementHouse === 'all' || item.id === managementHouse).map(item => { const total = sessions.filter(s => s.houseId === item.id).reduce((sum, s) => sum + durationMinutes(s), 0); const extra = extras.filter(e => e.houseId === item.id && e.status === 'approved').reduce((sum, e) => sum + e.minutes, 0); const amount = expenses.filter(e => e.houseId === item.id && e.status === 'approved').reduce((sum, e) => sum + e.cents, 0); return `<div class="house-summary"><div><strong>${item.name}</strong><small>${duration(total)}${extra ? ` + ${extra} min extra` : ''}</small></div><div class="summary-right"><strong>${euros(amount)}</strong><small>Gastos aprobados</small></div></div>`; }).join('')}</section></div>
    <p class="reset-line">Datos guardados únicamente en este navegador.<button id="reset-demo" class="text-button">Restablecer demostración</button></p>`;
}

function render() {
  const page = currentPage();
  document.body.classList.toggle('cleaner-view', page === 'jornada');
  $('#main').innerHTML = `${loadError ? `<p class="form-error" role="alert">${esc(loadError)}</p>` : ''}${page === 'jornada' ? renderJornada() : page === 'actividad' ? renderActivity() : renderManagement()}`;
  $('#house-select')?.addEventListener('change', event => {
    const selectedHouse = event.target.value;
    commit(latest => {
      if (activeSession(latest)) throw new Error('La vivienda queda fijada hasta registrar la salida.');
      return { ...latest, selectedHouse };
    });
  });
  $('#shift-action')?.addEventListener('click', shiftAction);
  $('#add-expense')?.addEventListener('click', () => openRequest('expense'));
  $('#add-extra')?.addEventListener('click', () => openRequest('extra'));
  $('#activity-filter')?.addEventListener('change', event => { activityFilter = event.target.value; render(); $('#activity-filter').focus(); });
  $('#management-house')?.addEventListener('change', event => { managementHouse = event.target.value; render(); $('#management-house').focus(); });
  $('#management-month')?.addEventListener('change', event => { managementMonth = event.target.value; render(); $('#management-month').focus(); });
  $('#export')?.addEventListener('click', exportCSV);
  $('#reset-demo')?.addEventListener('click', resetDemo);
}

function modal(title, subtitle, content) {
  focusBeforeDialog = document.activeElement;
  $('#modal-content').innerHTML = `<div class="modal-body"><div class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button" data-close aria-label="Cerrar">${icon('close')}</button></div>${content}</div>`;
  $('#modal').showModal();
}

function closeModal() {
  $('#modal').close();
}

function shiftAction() {
  // Capture the timestamp at the first tap, before storage and rendering.
  const now = new Date();
  const active = activeSession(state);
  if (!active) {
    commit(latest => startSession(latest, state.selectedHouse, now), `Check-in registrado a las ${time(now)}.`);
    return;
  }
  commit(latest => {
    if (activeSession(latest)?.id !== active.id) throw new Error('Este fichaje ya ha cambiado. Revisa la pantalla.');
    return endSession(latest, now);
  }, `Check-out registrado a las ${time(now)}.`);
}

function openRequest(type) {
  const selectedId = activeSession(state)?.houseId || state.selectedHouse;
  if (!DEMO_HOUSES.some(item => item.id === selectedId)) {
    showToast('Elige una vivienda.');
    $('#house-select')?.focus();
    return;
  }
  receipt = null;
  receiptLoading = false;
  receiptReadToken += 1;
  const expense = type === 'expense';
  modal(expense ? 'Gasto extra' : 'Tiempo extra', house(selectedId).name, `<form id="request-form">
    <input type="hidden" name="houseId" value="${esc(selectedId)}">
    <label class="form-field"><span>${expense ? 'Importe (€)' : 'Minutos extra'}</span><input class="text-input" name="amount" type="text" inputmode="${expense ? 'decimal' : 'numeric'}" maxlength="${expense ? 7 : 3}" placeholder="${expense ? '0,00' : '20'}" required></label>
    <label class="form-field"><span>Motivo</span><textarea class="text-input" name="description" maxlength="240" minlength="5" placeholder="${expense ? 'Por ejemplo: productos de limpieza' : 'Por ejemplo: compra de productos antes de entrar'}" required></textarea></label>
    ${expense ? `<label class="upload-zone">${icon('camera')}<span><strong>Foto del ticket</strong><small>JPG, PNG, WebP o PDF · Máx. 2 MB</small></span><input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Foto del ticket" required></label><div id="upload-preview" class="upload-preview" aria-live="polite"></div>` : '<p class="form-hint">Solo minutos que no estén incluidos entre el check-in y el check-out.</p>'}
    <p id="form-error" class="form-error" role="alert"></p><button class="button full request-save" type="submit">Guardar ${expense ? 'gasto' : 'tiempo extra'}</button>
    <p class="form-foot">Demo: se guarda solo en este navegador.</p></form>`);
  $('#receipt-file')?.addEventListener('change', readReceipt);
  $('#request-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const errorBox = $('#form-error');
    errorBox.textContent = '';
    try {
      if (receiptLoading) throw new Error('Espera a que termine de cargarse el ticket.');
      if (expense && !receipt) throw new Error('Adjunta la foto del ticket.');
      const description = String(data.get('description')).trim();
      if (description.length < 5) throw new Error('Indica un motivo de al menos cinco caracteres.');
      const now = new Date();
      const item = { id: crypto.randomUUID(), houseId: selectedId, date: localDate(now), description, status: 'pending', createdAt: now.toISOString() };
      const collection = expense ? 'expenses' : 'extras';
      if (expense) Object.assign(item, { cents: parseCents(data.get('amount')), receipt, accounting: false });
      else Object.assign(item, { minutes: parseMinutes(data.get('amount')) });
      if (commit(latest => ({ ...latest, [collection]: [...latest[collection], item] }), `${expense ? 'Gasto' : 'Tiempo extra'} guardado en la demo.`)) closeModal();
    } catch (error) { errorBox.textContent = error.message; }
  });
}

async function readReceipt(event) {
  const file = event.target.files[0];
  const token = ++receiptReadToken;
  receipt = null;
  receiptLoading = false;
  $('#upload-preview').textContent = '';
  $('#form-error').textContent = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 2 * 1024 * 1024 || file.size === 0) {
    $('#form-error').textContent = 'Elige un JPG, PNG, WebP o PDF de hasta 2 MB que no esté vacío.';
    event.target.value = '';
    return;
  }
  receiptLoading = true;
  $('#upload-preview').textContent = 'Cargando ticket…';
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se ha podido leer el ticket. Prueba con otro archivo.'));
      reader.readAsDataURL(file);
    });
    if (token !== receiptReadToken || !$('#modal').open || !$('#upload-preview')) return;
    receipt = { name: file.name.slice(0, 120), data };
    $('#upload-preview').innerHTML = `${file.type.startsWith('image/') ? `<img src="${esc(data)}" alt="Vista previa del ticket">` : ''}${esc(file.name)} · ${Math.ceil(file.size / 1024)} KB <button class="text-button" type="button" id="remove-receipt">Quitar</button>`;
    $('#remove-receipt').addEventListener('click', () => { receipt = null; $('#receipt-file').value = ''; $('#upload-preview').textContent = ''; });
  } catch (error) {
    if (token === receiptReadToken && $('#form-error')) $('#form-error').textContent = error.message;
  } finally {
    if (token === receiptReadToken) receiptLoading = false;
  }
}

function showReceipt(id) {
  const item = state.expenses.find(entry => entry.id === id);
  if (!item?.receipt) return;
  const image = item.receipt.data.startsWith('data:image/');
  modal('Ticket de prueba', esc(item.receipt.name), `${image ? `<img class="receipt-view" src="${esc(item.receipt.data)}" alt="Ticket adjunto">` : '<p class="prose">Este ticket es un documento PDF. Puedes descargarlo para revisarlo.</p>'}<button id="download-receipt" class="button secondary full">${icon('download')} Descargar ticket</button>`);
  $('#download-receipt').addEventListener('click', () => {
    const [metadata, encoded] = item.receipt.data.split(',');
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    download(new Blob([bytes], { type: metadata.slice(5, metadata.indexOf(';')) }), item.receipt.name.replace(/[^\p{L}\p{N}._ -]/gu, '_'));
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportCSV() {
  // Prefix spreadsheet formulas even when they follow whitespace.
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+\-@]/, match => `'${match}`).replace(/"/g, '""')}"`;
  const rows = [['Tipo', 'Vivienda', 'Fecha', 'Entrada', 'Salida', 'Minutos registrados', 'Minutos adicionales', 'Importe EUR', 'Concepto', 'Estado', 'Ejemplo']];
  for (const item of allEvents().filter(entry => inScope(entry, entry.date))) {
    rows.push([item.type === 'session' ? 'Jornada' : item.type === 'expense' ? 'Gasto' : 'Tiempo adicional', house(item.houseId).name, item.date, item.start || '', item.end || '', item.type === 'session' ? durationMinutes(item) : '', item.minutes || '', item.cents ? (item.cents / 100).toFixed(2).replace('.', ',') : '', item.description || '', item.type === 'session' ? (item.end ? 'Finalizada' : 'En curso') : statusLabels[item.status][1], item.example ? 'Sí' : 'No']);
  }
  download(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `limpieza-demo-${localDate()}.csv`);
  showToast('CSV de prueba descargado.');
}

function resetDemo() {
  modal('Volver a empezar', 'Restablecer esta demostración', '<div class="prose"><p>Se borrarán los fichajes, solicitudes y tickets de prueba guardados en este navegador. La pantalla volverá a estar vacía.</p></div><p id="form-error" class="form-error" role="alert"></p><button id="confirm-reset" class="button danger full">Borrar pruebas y restablecer</button>');
  $('#confirm-reset').addEventListener('click', () => {
    try {
      const next = seedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      state = next;
      loadError = '';
      managementHouse = 'all';
      managementMonth = 'all';
      render();
      closeModal();
      showToast('Demo restablecida.');
    } catch { $('#form-error').textContent = 'El navegador no permite guardar datos. Prueba fuera del modo privado o habilita el almacenamiento.'; }
  });
}

$('#demo-info').addEventListener('click', () => modal('Vista de prueba', '', `<div class="prose"><p>Elige vivienda, pulsa check-in al llegar y check-out al irte. En Extras puedes guardar un gasto con su ticket o minutos adicionales con su motivo.</p><p>Esta demo guarda todo <strong>solo en este navegador</strong>. Todavía no comprueba el wifi ni envía los datos o los tickets al propietario.</p><p>No subas tickets reales. Los importes y justificantes se usarán para revisión, separados de la contabilidad.</p></div><button class="button full" data-close>Entendido</button>`));

document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    $('#main').focus();
    return;
  }
  if (event.target.closest('[data-close]')) closeModal();
  const receiptButton = event.target.closest('[data-receipt]');
  if (receiptButton) showReceipt(receiptButton.dataset.receipt);
  const review = event.target.closest('[data-review]');
  if (review) commit(latest => reviewRequest(latest, review.dataset.collection, review.dataset.id, review.dataset.review), review.dataset.review === 'approved' ? 'Solicitud de prueba aprobada.' : 'Solicitud de prueba rechazada.');
});

$('#modal').addEventListener('close', () => {
  receiptReadToken += 1;
  receiptLoading = false;
  receipt = null;
  if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus();
  else if (focusBeforeDialog?.id && document.getElementById(focusBeforeDialog.id)) document.getElementById(focusBeforeDialog.id).focus();
  else $('#main').focus({ preventScroll: true });
});

$('#modal').addEventListener('click', event => {
  if (event.target !== $('#modal')) return;
  const rect = $('#modal').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
});

window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); $('#main').focus({ preventScroll: true }); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  try {
    const updated = event.newValue ? JSON.parse(event.newValue) : seedState();
    if (!validateState(updated)) throw new Error('invalid-state');
    state = updated;
    loadError = '';
    render();
    showToast('Actividad actualizada desde otra pestaña.');
  } catch { showToast('Los datos han cambiado. Recarga o restablece la demo.'); }
});


render();
