import { createImageUploads, validateUploadFile, uploadErrorMessage } from '../backend/image-uploads.js?v=legacy-replacement-1';
import { AdminAccessDenied } from '../backend/admin-properties.js';
const $ = id => document.getElementById(id);

export function createImagePanel(client, { supabaseUrl, getProperty, canUpload, onBusy, onDenied }) {
  const repo = createImageUploads(client);
  let propertyId = null, epoch = 0, busy = false, queue = [], loadedAt = 0, refreshSequence = 0, operations = [], replacementReady = false;
  const note = text => { $('image-status').textContent = text; };
  const previewMessage = 'La fotografía está guardada, pero no pudimos mostrar la vista previa. Actualizá las fotografías para reintentar.';

  function sync() {
    const saved = !!getProperty()?.id;
    const locked = queue.some(item => !!item.metadata && !item.done);
    $('image-controls').disabled = !saved || busy || !canUpload();
    $('refresh-images').disabled = !saved || busy;
    $('image-replacement-source').disabled = locked || busy || !replacementReady || !canUpload();
    $('image-source').disabled = locked;
    $('image-illustrative').disabled = locked || $('image-source').value === 'ai';
    for (const [index, item] of queue.entries()) {
      const input = $(`image-alt-${index}`);
      if (input) input.disabled = !!item.metadata;
    }
    for (const button of $('image-gallery').querySelectorAll('button')) button.disabled = busy || !saved || !canUpload();
    for (const button of $('image-replacements').querySelectorAll('button')) button.disabled = busy || !saved || !canUpload() || button.dataset.previewReady === '0';
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
    replacementReady = false; sync();
    note('Cargando fotografías…');
    try {
      const rows = await repo.list(id);
      replacementReady = false;
      operations = await repo.replacements(id);
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
      await drawReplacements(id, rows, active);
      if (!active()) return false;
      replacementReady = true; sync();
      loadedAt = Date.now();
      note(previewProblems ? previewMessage : '');
      return !previewProblems;
    } catch (error) {
      if (active()) { if (error instanceof AdminAccessDenied) onDenied(error); else note(error.message); }
      return false;
    }
  }

  async function drawReplacements(id, rows, active) {
    const selector = $('image-replacement-source'), selected = selector.value;
    selector.replaceChildren(new Option('Agregar fotografía sin reemplazar', ''));
    for (const row of rows.filter(row => row.storage_kind === 'legacy' && row.processing_status === 'ready')) selector.add(new Option(row.alt || row.id, row.id));
    selector.value = [...selector.options].some(option => option.value === selected) ? selected : '';
    const container = $('image-replacements'); container.replaceChildren();
    if (!operations.length) { const p = document.createElement('p'); p.textContent = 'Todavía no hay reemplazos.'; container.append(p); }
    for (const op of operations) {
      const section = document.createElement('section'), heading = document.createElement('h4'), comparison = document.createElement('div');
      heading.textContent = {prepared:'Candidata en preparación',confirmed:'Reemplazo confirmado',reverted:'Reemplazo revertido o cancelado'}[op.state] || 'Estado desconocido';
      comparison.className = 'replacement-comparison'; section.append(heading, comparison); container.append(section);
      let candidateImage = null, originalImage = null;
      for (const [label,row] of [['Original conservada',op.source],['Candidata administrada',op.candidate]]) {
        const figure = document.createElement('figure'), caption = document.createElement('figcaption');
        caption.textContent = label + (row ? `: ${row.alt}` : ': no disponible'); figure.append(caption); comparison.append(figure);
        if (!row) continue;
        const url = await repo.preview(row, new URL('../', location.href), supabaseUrl);
        if (!active()) return;
        if (url) { const img = document.createElement('img'); img.alt = row.alt; img.src = url; figure.prepend(img); if (row === op.candidate) candidateImage = img; else originalImage = img; }
        else { const p = document.createElement('p'); p.textContent = row.processing_status === 'ready' ? previewMessage : 'La candidata todavía no está lista. Reintentá con el mismo archivo o procesá el original ya guardado.'; figure.append(p); }
      }
      const action = (text, callback) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button'; button.textContent = text;
        button.addEventListener('click', async () => {
          if (busy || !canUpload() || button.disabled || !active()) return;
          const run = epoch; setBusy(true);
          try { const changed = await callback(); if (changed === false) return; if (run === epoch && await refresh()) note('Operación completada. Las fotografías originales se conservan.'); }
          catch (error) { if (run === epoch) { if (error instanceof AdminAccessDenied) onDenied(error); else note(error.message); } }
          finally { if (run === epoch) setBusy(false); }
        }); section.append(button); return button;
      };
      if (op.state === 'prepared') {
        if (op.candidate && op.candidate.processing_status !== 'ready' && op.candidate.processing_attempts < 5) action('Reintentar procesamiento de candidata', () => repo.process(id, op.candidate_image_id));
        if (op.candidate?.processing_status === 'ready') {
          const button = action('Confirmar reemplazo', async () => { if (!confirm('¿Confirmar el reemplazo? La fotografía original se conservará para revertir.')) return false; return repo.replacementAction('confirmReplacement',id,op.id); });
          const checkPreview = () => { button.dataset.previewReady = candidateImage?.complete && candidateImage.naturalWidth > 0 && originalImage?.complete && originalImage.naturalWidth > 0 ? '1' : '0'; sync(); };
          for (const img of [candidateImage,originalImage]) if (img) { img.addEventListener('load',checkPreview); img.addEventListener('error',checkPreview); }
          checkPreview();
        }
        action('Cancelar preparación', async () => { if (!confirm('¿Cancelar esta preparación? Se conservarán los archivos ya cargados.')) return false; return repo.replacementAction('revertReplacement',id,op.id); });
      } else if (op.state === 'confirmed') action('Revertir a la original', async () => { if (!confirm('¿Restaurar la fotografía original y conservar la candidata?')) return false; return repo.replacementAction('revertReplacement',id,op.id); });
    }
  }

  $('image-replacement-source').addEventListener('change', () => {
    if (busy) return;
    queue = []; drawQueue(); $('image-files').value = ''; sync();
    note($('image-replacement-source').value ? 'Seleccioná una candidata. Si ya hay una preparación, usá el mismo archivo para reintentar.' : 'La carga agregará fotografías sin reemplazar.');
  });
  $('image-files').addEventListener('change', () => {
    if (busy) return;
    try {
      const files = [...$('image-files').files];
      if (files.length > 20) throw new Error('Seleccioná como máximo 20 fotografías por lote.');
      const sourceImageId = $('image-replacement-source').value;
      if (sourceImageId && files.length !== 1) throw new Error('Seleccioná una sola candidata para reemplazar.');
      files.forEach(validateUploadFile);
      const pending = operations.find(op => op.source_image_id === sourceImageId && op.state === 'prepared');
      queue = files.map(file => ({ id: pending?.id || crypto.randomUUID(), sourceImageId: sourceImageId || null, file, alt: pending?.candidate?.alt || '', state: 'Pendiente' }));
      if (pending?.candidate) {
        $('image-source').value = pending.candidate.source_kind; $('image-illustrative').checked = pending.candidate.illustrative;
        for (const item of queue) item.metadata = Object.freeze({alt:pending.candidate.alt,sourceKind:pending.candidate.source_kind,illustrative:pending.candidate.illustrative});
      }
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
        operations = []; replacementReady = false; $('image-replacements').replaceChildren();
        $('image-replacement-source').replaceChildren(new Option('Agregar fotografía sin reemplazar', ''));
        epoch++; propertyId = id; queue = []; drawQueue(); $('image-files').value = '';
        $('image-gallery').replaceChildren(); $('image-count').textContent = ''; loadedAt = 0;
      }
      sync();
      if (id && Date.now() - loadedAt > 240000 && !busy) refresh();
    },
    hide() { refreshSequence++; $('image-panel').hidden = true; $('image-gallery').replaceChildren(); loadedAt = 0; },
    clear() {
      operations = []; replacementReady = false; $('image-replacements').replaceChildren();
      epoch++; propertyId = null; queue = []; busy = false; onBusy(false); $('image-upload-form').reset();
      $('image-queue').replaceChildren(); $('image-gallery').replaceChildren(); $('image-count').textContent = ''; note('');
      $('image-panel').hidden = true; sync();
    },
    isBusy: () => busy,
    hasPending: () => queue.some(item => !item.done),
  };
}
