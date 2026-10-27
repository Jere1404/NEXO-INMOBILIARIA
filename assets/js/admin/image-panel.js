import { createImageUploads, validateUploadFile, uploadErrorMessage } from '../backend/image-uploads.js';
import { AdminAccessDenied } from '../backend/admin-properties.js';
const $ = id => document.getElementById(id);

export function createImagePanel(client, { supabaseUrl, getProperty, canUpload, onBusy, onDenied }) {
  const repo = createImageUploads(client);
  let propertyId = null, epoch = 0, busy = false, queue = [], loadedAt = 0, refreshSequence = 0;
  const note = text => { $('image-status').textContent = text; };
  const previewMessage = 'La fotografía está guardada, pero no pudimos mostrar la vista previa. Actualizá las fotografías para reintentar.';

  function sync() {
    const saved = !!getProperty()?.id;
    const locked = queue.some(item => !!item.metadata);
    $('image-controls').disabled = !saved || busy || !canUpload();
    $('refresh-images').disabled = !saved || busy;
    $('image-source').disabled = locked;
    $('image-illustrative').disabled = locked || $('image-source').value === 'ai';
    for (const [index, item] of queue.entries()) {
      const input = $(`image-alt-${index}`);
      if (input) input.disabled = !!item.metadata;
    }
    for (const button of $('image-gallery').querySelectorAll('button')) button.disabled = busy || !saved || !canUpload();
    $('image-save-help').textContent = !saved
      ? 'Guardá primero la propiedad como borrador para agregar fotografías.'
      : !canUpload()
        ? 'Guardá los cambios de la propiedad antes de subir fotografías.'
        : 'JPEG, PNG o WebP · hasta 10 MiB · sin animaciones. La vista previa aparece después de validar y optimizar.';
  }
  function setBusy(value) { busy = value; onBusy(value); sync(); }
  function drawQueue() {
    $('image-queue').replaceChildren();
    for (const [index, item] of queue.entries()) {
      const li = document.createElement('li'), label = document.createElement('label');
      const input = document.createElement('input'), state = document.createElement('p');
      label.htmlFor = `image-alt-${index}`;
      label.textContent = `Descripción de ${item.file.name} (${Math.ceil(item.file.size / 1024)} KB)`;
      input.id = label.htmlFor; input.value = item.alt; input.required = true; input.maxLength = 500; input.autocomplete = 'off';
      input.addEventListener('input', () => { item.alt = input.value; });
      state.textContent = item.state || 'Pendiente'; state.setAttribute('role', 'status'); item.stateNode = state;
      li.append(label, input, state); $('image-queue').append(li);
    }
  }

  async function refresh() {
    const id = getProperty()?.id;
    if (!id) return false;
    const run = epoch, view = ++refreshSequence;
    const active = () => run === epoch && view === refreshSequence && !$('image-panel').hidden && id === getProperty()?.id;
    note('Cargando fotografías…');
    try {
      const rows = await repo.list(id);
      if (!active()) return false;
      for (const item of queue) if (rows.some(row => row.id === item.id && row.processing_status === 'ready')) {
        item.done = true;
        if (item.stateNode) item.stateNode.textContent = 'Lista';
      }
      $('image-gallery').replaceChildren();
      $('image-count').textContent = `${rows.length} ${rows.length === 1 ? 'fotografía' : 'fotografías'}`;
      let previewProblems = false;
      for (const row of rows) {
        const li = document.createElement('li'), placeholder = document.createElement('div');
        const caption = document.createElement('p'), status = document.createElement('p');
        placeholder.className = 'admin-photo-placeholder'; placeholder.textContent = 'Vista previa no disponible';
        caption.textContent = row.alt || 'Fotografía sin descripción';
        status.textContent = { ready: 'Lista', pending: 'Pendiente de procesamiento', failed: 'No se completó el procesamiento' }[row.processing_status] || 'Estado no disponible';
        if (row.processing_status === 'failed' && row.processing_error) status.textContent += `. ${uploadErrorMessage(row.processing_error)}`;
        if (row.storage_kind === 'managed' && row.processing_status !== 'ready' && row.processing_attempts >= 5) {
          status.textContent += '. Se alcanzó el límite de reintentos; esta fotografía necesita revisión.';
        }
        li.append(placeholder, caption, status); $('image-gallery').append(li);
        if (row.storage_kind === 'managed' && row.processing_status !== 'ready' && row.processing_attempts < 5) {
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-button';
          retry.textContent = 'Reintentar procesamiento'; retry.disabled = busy || !canUpload();
          retry.addEventListener('click', async () => {
            if (busy || !canUpload()) return;
            setBusy(true); const current = epoch;
            try {
              await repo.process(id, row.id);
              if (current === epoch && await refresh() && current === epoch) note('Fotografía procesada correctamente.');
            } catch (error) {
              if (current === epoch) { if (error instanceof AdminAccessDenied) onDenied(error); else note(error.message); }
            } finally { if (current === epoch) setBusy(false); }
          });
          li.append(retry);
        }
        let url = null;
        try { url = await repo.preview(row, new URL('../', location.href), supabaseUrl); }
        catch (error) { if (error instanceof AdminAccessDenied) { if (active()) onDenied(error); return false; } }
        if (!active()) return false;
        if (url) {
          const img = document.createElement('img'); img.src = url; img.alt = row.alt || 'Fotografía de la propiedad';
          img.loading = 'lazy'; img.decoding = 'async'; img.width = row.width; img.height = row.height;
          img.addEventListener('error', () => {
            if (!active()) return;
            previewProblems = true; img.replaceWith(placeholder); status.textContent = `Lista. ${previewMessage}`; note(previewMessage);
          }, { once: true });
          placeholder.replaceWith(img);
        } else if (row.processing_status === 'ready') {
          previewProblems = true; status.textContent = `Lista. ${previewMessage}`;
        }
      }
      if (!active()) return false;
      loadedAt = Date.now();
      note(previewProblems ? previewMessage : '');
      return !previewProblems;
    } catch (error) {
      if (active()) { if (error instanceof AdminAccessDenied) onDenied(error); else note(error.message); }
      return false;
    }
  }

  $('image-files').addEventListener('change', () => {
    if (busy) return;
    try {
      const files = [...$('image-files').files];
      if (files.length > 20) throw new Error('Seleccioná como máximo 20 fotografías por lote.');
      files.forEach(validateUploadFile);
      queue = files.map(file => ({ id: crypto.randomUUID(), file, alt: '', state: 'Pendiente' }));
      drawQueue(); note(files.length ? 'Completá una descripción para cada fotografía.' : 'Seleccioná al menos una fotografía.');
    } catch (error) { queue = []; drawQueue(); $('image-files').value = ''; note(error.message); }
    sync();
  });
  $('image-source').addEventListener('change', () => {
    if ($('image-source').value === 'ai') $('image-illustrative').checked = true;
    sync();
  });
  $('image-upload-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !canUpload() || !getProperty()?.id) return;
    if (!queue.length) { note('Seleccioná al menos una fotografía.'); return; }
    const run = epoch, id = getProperty().id, sourceKind = $('image-source').value, illustrative = $('image-illustrative').checked;
    setBusy(true);
    try {
      for (const item of queue) {
        if (run !== epoch) break;
        if (item.done) continue;
        try {
          await repo.upload(id, item, { sourceKind, illustrative, active: () => run === epoch, onState: text => {
            if (run === epoch) { item.state = text; item.stateNode.textContent = text; note(text); sync(); }
          } });
          if (run !== epoch) break;
          item.done = true; item.stateNode.textContent = 'Lista';
        } catch (error) {
          if (run !== epoch) break;
          if (error instanceof AdminAccessDenied) { onDenied(error); break; }
          item.stateNode.textContent = error.message;
        }
      }
      if (run === epoch) {
        const refreshed = await refresh();
        if (run === epoch && refreshed) note(queue.every(item => item.done)
          ? 'Todas las fotografías se cargaron y procesaron.'
          : 'Algunas fotografías quedaron pendientes. Podés reintentar sin duplicar la reserva.');
      }
    } finally { if (run === epoch) setBusy(false); }
  });
  $('refresh-images').addEventListener('click', refresh);
  return {
    sync,
    show() {
      const id = getProperty()?.id || null; $('image-panel').hidden = false;
      if (id !== propertyId) {
        epoch++; propertyId = id; queue = []; drawQueue(); $('image-files').value = '';
        $('image-gallery').replaceChildren(); $('image-count').textContent = ''; loadedAt = 0;
      }
      sync();
      if (id && Date.now() - loadedAt > 240000 && !busy) refresh();
    },
    hide() { refreshSequence++; $('image-panel').hidden = true; $('image-gallery').replaceChildren(); loadedAt = 0; },
    clear() {
      epoch++; propertyId = null; queue = []; busy = false; onBusy(false); $('image-upload-form').reset();
      $('image-queue').replaceChildren(); $('image-gallery').replaceChildren(); $('image-count').textContent = ''; note('');
      $('image-panel').hidden = true; sync();
    },
    isBusy: () => busy,
    hasPending: () => queue.some(item => !item.done),
  };
}
