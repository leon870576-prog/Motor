/* Local BBCode editor: text insertion only; no HTML execution or network writes. */
(() => {
  'use strict';
  const fields = [...document.querySelectorAll('textarea[data-smile-picker],input[data-smile-picker]')]
    .filter(f => !f.disabled && !f.readOnly && !f.closest('fieldset[disabled]') && (f.tagName === 'TEXTAREA' || f.type === 'text'));
  if (!fields.length) return;
  const tags = [['b','Жирный'],['i','Курсив'],['u','Подчёркнутый'],['del','Зачёркнутый'],['q','Цитата'],['code','Код'],
    ['url','Ссылка'],['big','Крупный'],['small','Мелкий'],['red','Красный'],['green','Зелёный'],['blue','Синий'],['yellow','Золотой']];
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const button = (cls, text) => { const e = make('button', cls, text); e.type = 'button'; return e; };
  const focus = e => e.focus({preventScroll:true});
  const panel = make('section', 'tag-picker-panel'); panel.id = 'motor-tag-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Выбор тегов');
  const bar = make('div', 'tag-picker-toolbar');
  const search = make('input', 'tag-picker-search'); search.type = 'search'; search.placeholder = 'Найти тег'; search.maxLength = 40; search.setAttribute('aria-label','Поиск тега');
  const close = button('tag-picker-close','×'); close.setAttribute('aria-label','Закрыть теги'); bar.append(search,close);
  const hint = make('p','tag-picker-hint','Выделите текст или вставьте тег в место курсора.');
  const grid = make('div','tag-picker-grid');
  const linkBox = make('div','tag-picker-link'); linkBox.hidden = true;
  const label = make('label','','Адрес ссылки (http или https)');
  const url = make('input','tag-picker-url'); url.type = 'url'; url.placeholder = 'https://'; url.maxLength = 2048; url.setAttribute('aria-label','Адрес ссылки'); label.append(url);
  const addLink = button('tag-picker-add-link','Вставить ссылку'); linkBox.append(label,addLink);
  panel.append(bar,hint,grid,linkBox);
  let current = null;
  const remember = s => { if (document.activeElement === s.field) { s.start = s.field.selectionStart; s.end = s.field.selectionEnd; } };
  const hide = (restore = true) => { if (!current) return; const old = current; current = null; panel.hidden = true; old.trigger.setAttribute('aria-expanded','false'); if (restore) focus(old.trigger); };
  const insert = (tag, address) => {
    const s = current; if (!s || s.field.disabled || s.field.readOnly) return;
    const f = s.field, start = Math.min(s.start, f.value.length), end = Math.max(start, Math.min(s.end, f.value.length));
    const selected = f.value.slice(start,end);
    const open = '[' + tag + (address ? '=' + address : '') + ']', shut = '[/' + tag + ']';
    const text = selected || (address ? 'Ссылка' : ''); const value = open + text + shut;
    if (f.maxLength >= 0 && f.value.length - (end-start) + value.length > f.maxLength) { s.status.textContent = 'Недостаточно места: достигнут лимит поля.'; return; }
    f.setRangeText(value,start,end,'end'); s.start = start + open.length; s.end = s.start + text.length;
    f.dispatchEvent(new Event('input',{bubbles:true})); hide(false); focus(f); f.setSelectionRange(s.start,s.end);
    s.status.textContent = 'Тег вставлен. Можно продолжать ввод.';
  };
  const render = () => {
    grid.replaceChildren(); const q = search.value.trim().toLocaleLowerCase('ru');
    for (const [tag,name] of tags.filter(t => t.join(' ').toLocaleLowerCase('ru').includes(q))) {
      const b = button('tag-picker-choice',name); b.title = '['+tag+']'; b.setAttribute('aria-label','Вставить тег: '+name);
      b.addEventListener('pointerdown',e=>e.preventDefault());
      b.addEventListener('click',()=> { if (tag === 'url') { grid.hidden = true; linkBox.hidden = false; url.value = ''; focus(url); } else insert(tag); }); grid.append(b);
    }
    if (!grid.children.length) grid.append(make('p','','Теги не найдены'));
  };
  const putLink = () => {
    const value = url.value.trim(); let valid = false;
    try { const u = new URL(value); valid = /^https?:\/\//i.test(value) && ['http:','https:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password && !/[\s<>"'\[\]\\]/.test(value); } catch { /* invalid address */ }
    if (!valid) { current.status.textContent = 'Укажите корректную ссылку с http:// или https://.'; url.setAttribute('aria-invalid','true'); focus(url); return; }
    url.removeAttribute('aria-invalid'); insert('url', value);
  };
  fields.forEach((field,index)=> {
    const smileHost = (field.closest('label') || field).nextElementSibling;
    const host = smileHost?.classList.contains('smile-picker') ? smileHost : make('div','smile-picker');
    if (host !== smileHost) (field.closest('label') || field).insertAdjacentElement('afterend',host);
    const trigger = button('tag-picker-toggle','[b] Теги'); trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-controls',panel.id);
    const status = make('span','tag-picker-status'); status.setAttribute('role','status');
    host.append(trigger,status); const s = {field,host,trigger,status,start:field.value.length,end:field.value.length};
    ['input','select','keyup','pointerup','blur'].forEach(type=>field.addEventListener(type,()=>remember(s)));
    trigger.addEventListener('pointerdown',()=>remember(s));
    trigger.addEventListener('click',()=> {
      if (current === s) { hide(); return; }
      document.dispatchEvent(new CustomEvent('motor:picker-open',{detail:'tags'})); hide(false); current = s;
      status.textContent = ''; search.value = ''; grid.hidden = false; linkBox.hidden = true; url.removeAttribute('aria-invalid');
      host.append(panel); panel.hidden = false; trigger.setAttribute('aria-expanded','true'); field.blur(); render(); focus(grid.firstElementChild || close);
      panel.scrollIntoView({block:'nearest',behavior:'auto'});
    });
    field.addEventListener('focus',()=>{ if (current?.field === field) hide(false); });
    field.form?.addEventListener('reset',()=>{ if (current?.field === field) hide(false); setTimeout(()=>s.start=s.end=field.value.length,0); });
  });
  const resize = () => panel.style.setProperty('--tag-viewport',(window.visualViewport?.height || innerHeight)+'px');
  resize(); window.visualViewport?.addEventListener('resize',resize); window.addEventListener('resize',resize);
  search.addEventListener('input',()=>{grid.hidden=false;linkBox.hidden=true;render();});
  search.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault();});
  url.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();putLink();}}); addLink.addEventListener('click',putLink);
  close.addEventListener('click',()=>hide());
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && current){e.preventDefault();hide();}});
  document.addEventListener('click',e=>{if(current && !e.composedPath().includes(current.host))hide(false);});
  document.addEventListener('motor:picker-open',e=>{if(e.detail!=='tags')hide(false);});
})();
