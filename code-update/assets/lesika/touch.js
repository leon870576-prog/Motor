/* Progressive touch enhancements. No requests, storage, HTML injection or form submission. */
(() => {
 'use strict';
 const content=document.querySelector('.legacy-content');
 if(!content)return;
 for(const link of content.querySelectorAll('a[href]')) {
  if(link.className || link.closest('.home-sections,.neighbor-links,.home-account,.nav'))continue;
  try {
   const url=new URL(link.getAttribute('href'),location.href);
   if(url.origin===location.origin && (url.pathname.endsWith('.php') || ['#up','#down'].includes(url.hash)))link.classList.add('touch-link');
  }catch{/* Malformed user links remain untouched. */}
 }
 const knownLabels={cookietrue:'Запомнить меня',times:'Показывать часы',editperson:'Персонаж игры',ipcontrol:'Привязка к IP', 'del[]':'Выбрать запись для удаления'};
 for(const input of content.querySelectorAll('input[type="checkbox"],input[type="radio"]')) {
  if(input.labels.length)continue;
  const label=document.createElement('label');label.className='choice-hit';
  input.before(label);label.append(input);
  if(!input.hasAttribute('aria-label')) {
   let text=knownLabels[input.name];
   if(input.type==='radio' && ['0','1'].includes(input.value) && text)text+=': '+(input.value==='1'?'да':'нет');
   input.setAttribute('aria-label',text || (input.type==='radio'?'Выбрать вариант':'Выбрать'));
  }
 }
 // Wide legacy tables scroll locally; the page itself stays within the display.
 for(const table of content.querySelectorAll('table')) {
  if(table.closest('.table-scroll') || table.parentElement.closest('table'))continue;
  const region=document.createElement('div');region.className='table-scroll';
  region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','Таблица. При необходимости прокрутите в сторону');
  table.before(region);region.append(table);
 }
 const menu=document.querySelector('.site-menu'), summary=menu?.querySelector('summary');
 if(menu) {
  document.addEventListener('click',event=>{if(menu.open&&!event.composedPath().includes(menu))menu.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;summary.focus();}});
  menu.querySelector('nav')?.addEventListener('click',event=>{if(event.target.closest('a'))menu.open=false;});
 }
 const viewport=window.visualViewport;
 let frame=0, lastWidth=-1, lastHeight='', keyboardOpen=false;
 function resize() {
  frame=0;
  const height=viewport?.height || window.innerHeight;
  const editing=document.activeElement?.matches('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])');
  // Scrolling can animate the browser toolbar. Closed menus need no layout updates.
  if(lastWidth!==window.innerWidth || menu?.open || editing) {
   const nextHeight=Math.round(height)+'px';
   if(nextHeight!==lastHeight){document.documentElement.style.setProperty('--visual-height',nextHeight);lastHeight=nextHeight;}
  }
  lastWidth=window.innerWidth;
  // Only react to a keyboard-sized reduction, never to pinch zoom.
  const nextKeyboard=Boolean(editing&&viewport&&viewport.scale<1.05&&window.innerHeight-height>120);
  if(nextKeyboard!==keyboardOpen){document.body.toggleAttribute('data-keyboard-open',nextKeyboard);keyboardOpen=nextKeyboard;}
 }
 const scheduleResize=()=>{if(!frame)frame=requestAnimationFrame(resize);};
 viewport?.addEventListener('resize',scheduleResize);
 window.addEventListener('resize',scheduleResize);
 document.addEventListener('focusin',scheduleResize);
 document.addEventListener('focusout',scheduleResize);
 menu?.addEventListener('toggle',scheduleResize);
 resize();
})();
