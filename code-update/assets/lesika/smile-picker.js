/* Local progressive enhancement. No network writes, HTML injection or storage. */
(() => {
  'use strict';
  const data = document.getElementById('motor-smile-data');
  if (!data) return;
  let groups;
  try { groups = JSON.parse(data.textContent); } catch { return; }
  if (!Array.isArray(groups)) return;
  // Restrict image sources even if a future catalogue source changes.
  groups = groups.filter(group => ['smiles', 'smiles2', 'emoji'].includes(group.id) && Array.isArray(group.items))
    .map(group => ({ ...group, items: group.items.filter(item => {
      if (typeof item.code !== 'string' || !item.code || item.code.length > 60 || typeof item.label !== 'string') return false;
      if (item.image === null) return group.id === 'emoji';
      if (typeof item.image !== 'string' || group.id === 'emoji') return false;
      try {
        const url = new URL(item.image, document.baseURI);
        return url.origin === location.origin && /\/images\/smiles2?\/[A-Za-z0-9_()]+\.gif$/.test(decodeURIComponent(url.pathname)) && !url.search && !url.hash;
      } catch { return false; }
    }) }));
  document.querySelectorAll('button[data-smile-copy]').forEach(choice => {
    choice.addEventListener('click', async () => {
      const status = document.getElementById('motor-smile-copy-status');
      const code = choice.dataset.smileCopy;
      if (!status || !groups.some(group => group.items.some(item => item.code === code))) return;
      try {
        await navigator.clipboard.writeText(code);
        status.textContent = 'Код ' + code + ' скопирован. Вставьте его в сообщение.';
      } catch { status.textContent = 'Код смайла: ' + code + '. В сообщении нажмите «Смайлы» для вставки.'; }
    });
  });
  const fields = [...document.querySelectorAll('textarea[data-smile-picker],input[data-smile-picker]')]
    .filter(field => !field.disabled && !field.readOnly && !field.closest('fieldset[disabled]') &&
      (field.tagName === 'TEXTAREA' || ['text', 'search'].includes(field.type)));
  if (!fields.length || !groups.length) return;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text) => {
    const node = make('button', className, text); node.type = 'button'; return node;
  };
  let current = null, activeGroup = 'smiles';
  const panel = make('section', 'smile-picker-panel');
  panel.id = 'motor-smile-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Выбор смайлов');
  const toolbar = make('div', 'smile-picker-toolbar');
  const search = make('input', 'smile-picker-search');
  search.type = 'search'; search.placeholder = 'Найти смайл'; search.autocomplete = 'off'; search.maxLength = 60;
  search.setAttribute('aria-label', 'Поиск смайла по названию или коду');
  const close = button('smile-picker-close', '×'); close.setAttribute('aria-label', 'Закрыть смайлы');
  toolbar.append(search, close);
  const tabs = make('div', 'smile-picker-tabs'); tabs.setAttribute('aria-label', 'Наборы смайлов');
  const grid = make('div', 'smile-picker-grid'); grid.setAttribute('aria-label', 'Смайлы для вставки');
  panel.append(toolbar, tabs, grid);
  const available = () => groups.filter(group => group.items.length && (group.id !== 'smiles2' || current.field.dataset.smileScope !== 'common'));
  const remember = state => {
    if (document.activeElement === state.field) {
      state.start = state.field.selectionStart; state.end = state.field.selectionEnd;
    }
  };
  const focus = node => { try { node.focus({ preventScroll: true }); } catch { node.focus(); } };
  const hide = (restore = true) => {
    if (!current) return;
    const previous = current; panel.hidden = true; current = null;
    previous.trigger.setAttribute('aria-expanded', 'false');
    if (restore) focus(previous.trigger);
  };
  const insert = item => {
    const state = current;
    if (!state || state.field.disabled || state.field.readOnly) return;
    const field = state.field, value = field.value;
    const start = Math.min(state.start, value.length), end = Math.max(start, Math.min(state.end, value.length));
    const before = value.slice(0, start), after = value.slice(end);
    const text = (before && !/\s$/.test(before) ? ' ' : '') + item.code + (after && /^\s/.test(after) ? '' : ' ');
    if (field.maxLength >= 0 && value.length - (end - start) + text.length > field.maxLength) {
      state.status.textContent = 'Смайл не помещается: достигнут лимит длины текста.'; return;
    }
    field.setRangeText(text, start, end, 'end');
    if (after && /^\s/.test(after)) field.setSelectionRange(field.selectionStart + 1, field.selectionStart + 1);
    state.start = state.end = field.selectionStart;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    state.status.textContent = 'Смайл вставлен.';
    hide(false); focus(field); field.setSelectionRange(state.start, state.end);
  };
  const render = () => {
    if (!current) return;
    const allowed = available();
    if (!allowed.some(group => group.id === activeGroup)) activeGroup = allowed[0]?.id;
    tabs.replaceChildren(); grid.replaceChildren();
    for (const group of allowed) {
      const tab = button('smile-picker-tab', group.label);
      tab.setAttribute('aria-pressed', String(group.id === activeGroup));
      tab.addEventListener('click', () => { activeGroup = group.id; search.value = ''; render(); focus(tabs.children[allowed.indexOf(group)]); });
      tabs.append(tab);
    }
    const query = search.value.trim().toLocaleLowerCase('ru');
    const items = (allowed.find(group => group.id === activeGroup)?.items || [])
      .filter(item => (item.label + ' ' + item.code).toLocaleLowerCase('ru').includes(query));
    for (const item of items) {
      const choice = button('smile-picker-choice'); choice.title = item.label;
      choice.setAttribute('aria-label', 'Вставить ' + item.label);
      if (item.image) {
        const img = make('img'); img.src = item.image; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; choice.append(img);
      } else choice.textContent = item.code;
      // Preserve the search/caret state on pointer interactions; clicks never submit the form.
      choice.addEventListener('pointerdown', event => event.preventDefault());
      choice.addEventListener('click', () => insert(item)); grid.append(choice);
    }
    if (!items.length) grid.append(make('p', 'smile-picker-empty', 'Смайлы не найдены'));
    grid.scrollTop = 0;
  };
  const resize = () => panel.style.setProperty('--smile-viewport', (window.visualViewport?.height || window.innerHeight) + 'px');
  window.visualViewport?.addEventListener('resize', resize); window.addEventListener('resize', resize); resize();
  fields.forEach((field, index) => {
    const host = make('div', 'smile-picker');
    const trigger = button('smile-picker-toggle', '☺ Смайлы');
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', panel.id);
    const status = make('span', 'smile-picker-status'); status.setAttribute('role', 'status');
    status.id = 'motor-smile-status-' + index;
    host.append(trigger, status); (field.closest('label') || field).insertAdjacentElement('afterend', host);
    const state = { field, trigger, host, status, start: field.value.length, end: field.value.length };
    ['input', 'select', 'keyup', 'pointerup', 'blur'].forEach(type => field.addEventListener(type, () => remember(state)));
    trigger.addEventListener('pointerdown', () => remember(state));
    trigger.addEventListener('click', () => {
      if (current === state) { hide(); return; }
      document.dispatchEvent(new CustomEvent('motor:picker-open', {detail: 'smiles'}));
      hide(false); current = state; status.textContent = ''; search.value = ''; activeGroup = 'smiles';
      host.append(panel); panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
      field.blur(); render(); focus(tabs.firstElementChild || close);
      panel.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    });
    field.addEventListener('focus', () => { if (current?.field === field) hide(false); });
    field.form?.addEventListener('reset', () => {
      if (current?.field === field) hide(false);
      setTimeout(() => { state.start = state.end = field.value.length; }, 0);
    });
  });
  document.addEventListener('motor:picker-open', event => { if (event.detail !== 'smiles') hide(false); });
  search.addEventListener('input', render); close.addEventListener('click', () => hide());
  search.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && current) { event.preventDefault(); hide(); } });
  // Close after a completed click: closing on pointerdown would move the next
  // field's button before pointerup and swallow taps while switching fields.
  document.addEventListener('click', event => { if (current && !event.composedPath().includes(current.host)) hide(false); });
})();
