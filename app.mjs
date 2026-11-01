import { DEMO_HOUSES, STORAGE_KEY } from './config.mjs';
import { activeSession, durationMinutes, endSession, localDate, parseCents, parseMinutes, reviewRequest, seedState, startSession, validateRequestDate, validateState } from './model.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const euros = cents => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const time = value => new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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
  const selected = house(active?.houseId || state.selectedHouse);
  const todays = allEvents().filter(item => item.date === localDate() && item.houseId === selected.id);
  const todayMinutes = state.sessions.filter(item => item.houseId === selected.id && localDate(new Date(item.start)) === localDate()).reduce((sum, item) => sum + durationMinutes(item), 0);
  return `${heading('Tu espacio de limpieza', active ? 'Todo en marcha.' : 'Una casa lista empieza aquí.')}
    <div class="layout"><div class="jornada-column">
      <section class="card house-card" aria-label="Vivienda seleccionada"><span class="house-initials">${selected.initials}</span><div class="house-select-wrap"><label class="field-caption" for="house-select">${active ? 'Jornada en curso en' : 'Hoy estás en'}</label><select id="house-select" class="house-select" ${active ? 'disabled' : ''}>${DEMO_HOUSES.map(item => `<option value="${item.id}" ${item.id === selected.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select><p class="house-detail">${selected.detail}</p></div>${icon('chevron')}</section>
      <section class="card shift-card" aria-label="Registro de jornada"><div class="shift-top"><span class="pill ${active ? 'green' : 'neutral'}"><span class="dot"></span>${active ? 'Jornada en curso' : 'Sin jornada activa'}</span>${icon('clock')}</div>
        <div class="shift-face"><div class="clock-art">${icon(active ? 'clock' : 'house')}</div>${active ? `<div class="timer" id="timer">${timerHTML(active)}</div><p class="shift-copy">Entrada de prueba a las ${time(active.start)}</p>` : '<p class="shift-title">¿Todo listo para empezar?</p><p class="shift-copy">Registra tu entrada y nos ponemos en marcha.</p>'}</div>
        <button id="shift-action" class="button full">${icon(active ? 'check' : 'arrow')}${active ? 'Registrar salida de prueba' : 'Registrar entrada de prueba'}</button><p class="shift-foot">${icon('info')} Simulación guardada solo en este dispositivo</p>
      </section>
      <div class="network-note">${icon('wifi')}<div><strong>Wifi pendiente de configurar</strong><p>Ahora puedes probar los botones sin comprobar la red. Los fichajes reales requerirán la conexión de esta casa.</p></div></div>
    </div><div class="stack">
      <section class="card extras-card"><h2>¿Algo más que añadir?</h2><p class="section-intro">Los pequeños recados también cuentan.</p><button class="action-row" id="add-expense"><span class="action-icon">${icon('receipt')}</span><span class="copy"><strong>Añadir un gasto</strong><small>Productos, materiales y su ticket</small></span>${icon('chevron')}</button><button class="action-row" id="add-extra"><span class="action-icon sand">${icon('plus')}</span><span class="copy"><strong>Añadir tiempo extra</strong><small>Un recado fuera de tu jornada</small></span>${icon('chevron')}</button></section>
      <section class="card today-card"><div class="section-label"><h2>Tu día, de un vistazo</h2>${todays.length ? `<span class="day-total">${duration(todayMinutes)}</span>` : '<span>Hoy</span>'}</div>${todays.length ? todays.map(eventHTML).join('') : `<div class="empty">${icon('history')}<strong>Un nuevo día por delante</strong><p>Aquí aparecerá tu actividad en ${selected.name}.</p></div>`}</section>
      <p class="local-note">${icon('info')}<span>Estás viendo una demo con viviendas ficticias. No introduzcas datos ni tickets reales.</span></p>
    </div></div>`;
}

function timerHTML(active) {
  const total = durationMinutes(active);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}<small>h / min</small>`;
}

function renderActivity() {
  const events = allEvents().filter(item => activityFilter === 'all' || item.type === activityFilter);
  const dates = [...new Set(events.map(item => item.date))];
  return `${heading('Todo en su sitio', 'Tu actividad.', 'Jornadas, gastos y tiempo adicional, sin perder el hilo.')}
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
  return `${heading('Vista del propietario · Demo', 'Todo bajo control.', 'Revisa lo registrado y decide qué gastos y extras aprobar.')}
    <div class="notice">Esta vista de gestión es pública solo en la demostración. En la versión real tendrá acceso privado para ti.</div>
    <div class="toolbar"><select id="management-house" class="select-input" aria-label="Filtrar por vivienda"><option value="all">Todas las viviendas</option>${DEMO_HOUSES.map(item => `<option value="${item.id}" ${managementHouse === item.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select><select id="management-month" class="select-input" aria-label="Filtrar por mes"><option value="all">Todo el historial</option>${months.map(month => `<option value="${month}" ${managementMonth === month ? 'selected' : ''}>${esc(new Date(`${month}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))}</option>`).join('')}</select><button id="export" class="button secondary">${icon('download')} Exportar CSV</button></div>
    <div class="metrics"><div class="card metric"><p class="metric-label">Tiempo registrado</p><p class="metric-value">${duration(logged)}</p><p class="metric-note">${sessions.filter(item => !item.end).length ? 'Incluye jornada en curso' : 'Según entradas y salidas'}</p></div><div class="card metric"><p class="metric-label">Extras aprobados</p><p class="metric-value">+${approvedMinutes} min</p><p class="metric-note">${extras.filter(item => item.status === 'pending').reduce((sum, item) => sum + item.minutes, 0)} min por revisar</p></div><div class="card metric"><p class="metric-label">Gastos pendientes</p><p class="metric-value">${euros(pendingCents)}</p><p class="metric-note">${euros(approvedCents)} aprobados</p></div></div>
    <div class="management-layout"><section class="card review-card"><div class="section-label"><h2>Pendiente de revisar</h2><span class="pill amber">${pending.length}</span></div>${pending.length ? pending.map(item => `<article class="review-item"><div class="review-top"><span class="event-icon">${icon(item.collection === 'expenses' ? 'receipt' : 'plus')}</span><div class="event-content"><p class="event-title">${esc(item.description)}</p><p class="event-description">${esc(house(item.houseId).name)} · ${esc(readableDate(item.date))}</p><div class="event-bottom">${item.example ? '<span class="example-label">Ejemplo de solicitud</span>' : ''}${item.receipt ? `<button class="text-button" data-receipt="${esc(item.id)}">Ver ticket</button>` : ''}</div></div><strong class="event-value">${item.collection === 'expenses' ? euros(item.cents) : `+${item.minutes} min`}</strong></div><div class="review-actions"><button class="button quiet" data-review="rejected" data-collection="${item.collection}" data-id="${esc(item.id)}">Rechazar</button><button class="button secondary" data-review="approved" data-collection="${item.collection}" data-id="${esc(item.id)}">${icon('check')} Aprobar</button></div></article>`).join('') : `<div class="empty">${icon('check')}<strong>Todo revisado</strong><p>No hay solicitudes pendientes con estos filtros.</p></div>`}</section>
    <section class="card review-card"><h2>Por vivienda</h2>${DEMO_HOUSES.filter(item => managementHouse === 'all' || item.id === managementHouse).map(item => { const total = sessions.filter(s => s.houseId === item.id).reduce((sum, s) => sum + durationMinutes(s), 0); const extra = extras.filter(e => e.houseId === item.id && e.status === 'approved').reduce((sum, e) => sum + e.minutes, 0); const amount = expenses.filter(e => e.houseId === item.id && e.status === 'approved').reduce((sum, e) => sum + e.cents, 0); return `<div class="house-summary"><div><strong>${item.name}</strong><small>${duration(total)}${extra ? ` + ${extra} min extra` : ''}</small></div><div class="summary-right"><strong>${euros(amount)}</strong><small>Gastos aprobados</small></div></div>`; }).join('')}</section></div>
    <p class="reset-line">Datos guardados únicamente en este navegador.<button id="reset-demo" class="text-button">Restablecer demostración</button></p>`;
}

function render() {
  const page = currentPage();
  $('#main').innerHTML = `${loadError ? `<p class="form-error" role="alert">${esc(loadError)}</p>` : ''}${page === 'jornada' ? renderJornada() : page === 'actividad' ? renderActivity() : renderManagement()}`;
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
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
  const active = activeSession(state);
  if (!active) {
    commit(latest => startSession(latest, state.selectedHouse), 'Entrada de prueba registrada. ¡Todo listo!');
    return;
  }
  modal('¿Terminamos por hoy?', house(active.houseId).name, `<div class="prose"><p>Entrada a las <strong>${time(active.start)}</strong>. Llevas <strong>${duration(durationMinutes(active))}</strong> en esta jornada de prueba.</p><p>La salida se guardará con la hora actual del dispositivo.</p></div><p id="form-error" class="form-error" role="alert"></p><button id="confirm-exit" class="button full">${icon('check')} Confirmar salida de prueba</button>`);
  $('#confirm-exit').addEventListener('click', () => {
    const activeId = active.id;
    if (commit(latest => {
      if (activeSession(latest)?.id !== activeId) throw new Error('Esta jornada ya ha cambiado. Cierra esta ventana y revisa tu actividad.');
      return endSession(latest);
    }, 'Salida de prueba registrada. ¡Gracias por tu trabajo!')) closeModal();
  });
}

function openRequest(type) {
  receipt = null;
  receiptLoading = false;
  receiptReadToken += 1;
  const expense = type === 'expense';
  const selectedId = activeSession(state)?.houseId || state.selectedHouse;
  modal(expense ? 'Añadir un gasto' : 'Añadir tiempo extra', expense ? 'Guarda el detalle y adjunta un ticket de prueba.' : 'Para recados fuera del tiempo ya registrado.', `<form id="request-form">
    <label class="form-field"><span>Vivienda</span><select name="houseId" class="select-input">${DEMO_HOUSES.map(item => `<option value="${item.id}" ${selectedId === item.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label>
    <div class="form-grid"><div class="form-field"><label class="field-label" for="request-amount">${expense ? 'Importe' : 'Minutos adicionales'}</label><div class="input-with-unit"><input class="text-input" name="amount" id="request-amount" type="text" inputmode="${expense ? 'decimal' : 'numeric'}" maxlength="${expense ? 7 : 3}" placeholder="${expense ? '0,00' : '20'}" required><span>${expense ? '€' : 'min'}</span></div>${expense ? '' : '<div class="quick-minutes"><button type="button" data-minutes="10">10</button><button type="button" data-minutes="20">20</button><button type="button" data-minutes="30">30</button></div>'}</div><label class="form-field"><span>Fecha</span><input class="text-input" name="date" type="date" value="${localDate()}" max="${localDate()}" required></label></div>
    <label class="form-field"><span>${expense ? '¿Qué has comprado?' : '¿A qué has dedicado ese tiempo?'}</span><textarea class="text-input" name="description" maxlength="240" minlength="5" placeholder="${expense ? 'Por ejemplo: detergente y bolsas de basura' : 'Por ejemplo: compra de productos antes de entrar'}" required></textarea></label>
    ${expense ? `<label class="upload-zone">${icon('camera')}<span><strong>Añadir foto o ticket</strong><small>Opcional · JPG, PNG, WebP o PDF · Máx. 2 MB</small></span><input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Adjuntar foto o ticket de prueba"></label><div id="upload-preview" class="upload-preview" aria-live="polite"></div>` : '<div class="notice">Si has hecho el recado entre la entrada y la salida, ese tiempo ya está incluido.</div><label class="checkbox-field"><input type="checkbox" name="outside" required> Este tiempo queda fuera de la jornada registrada.</label>'}
    <p id="form-error" class="form-error" role="alert"></p><button class="button full" type="submit">${icon('plus')} Guardar ${expense ? 'gasto' : 'solicitud'} de prueba</button><p class="form-foot">Quedará pendiente de revisión en Gestión.</p></form>`);
  document.querySelectorAll('[data-minutes]').forEach(button => button.addEventListener('click', () => { $('#request-amount').value = button.dataset.minutes; }));
  $('#receipt-file')?.addEventListener('change', readReceipt);
  $('#request-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const errorBox = $('#form-error');
    errorBox.textContent = '';
    try {
      if (receiptLoading) throw new Error('Espera a que termine de cargarse el ticket.');
      if ($('#receipt-file')?.files.length && !receipt) throw new Error('El ticket no se ha cargado. Elige otro archivo o quítalo.');
      const description = String(data.get('description')).trim();
      if (description.length < 5) throw new Error('Añade una descripción de al menos cinco caracteres.');
      const date = validateRequestDate(String(data.get('date')));
      const item = { id: crypto.randomUUID(), houseId: String(data.get('houseId')), date, description, status: 'pending', createdAt: new Date().toISOString() };
      const collection = expense ? 'expenses' : 'extras';
      if (expense) Object.assign(item, { cents: parseCents(data.get('amount')), receipt });
      else {
        if (!data.get('outside')) throw new Error('Confirma que este tiempo no está incluido en los fichajes.');
        Object.assign(item, { minutes: parseMinutes(data.get('amount')) });
      }
      if (commit(latest => ({ ...latest, [collection]: [...latest[collection], item] }), `${expense ? 'Gasto' : 'Tiempo extra'} de prueba guardado. Pendiente de revisión.`)) closeModal();
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
  modal('Volver a empezar', 'Restablecer esta demostración', '<div class="prose"><p>Se borrarán los fichajes, solicitudes y tickets de prueba guardados en este navegador. Volverán a aparecer los ejemplos iniciales.</p></div><p id="form-error" class="form-error" role="alert"></p><button id="confirm-reset" class="button danger full">Borrar pruebas y restablecer</button>');
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

$('#demo-info').addEventListener('click', () => modal('Una primera vuelta.', 'Esto es una demostración interactiva.', `<div class="prose"><p>Prueba la experiencia de limpieza antes de configurar tus viviendas.</p><ul><li><strong>Jornada:</strong> simula una entrada y una salida.</li><li><strong>Actividad:</strong> consulta las pruebas guardadas.</li><li><strong>Gestión:</strong> prueba cómo revisar gastos y minutos adicionales.</li></ul><p>Todo se guarda <strong>solo en este navegador</strong>. Los datos no se envían a Jaime ni se sincronizan con Inmomanagement.</p><p>Las viviendas son ficticias. El wifi todavía no se verifica y las horas dependen del reloj del dispositivo. <strong>No uses esta demo para fichar de verdad ni subas tickets reales.</strong></p></div><button class="button full" data-close>Entendido, vamos a probar</button>`));

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

setInterval(() => {
  const active = activeSession(state);
  if (active && $('#timer')) $('#timer').innerHTML = timerHTML(active);
}, 1000);

render();
