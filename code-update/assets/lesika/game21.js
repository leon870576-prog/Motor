(() => {
  'use strict';
  const root = document.querySelector('#g21');
  if (!root || !window.fetch || !window.FormData) return;
  const notice = root.querySelector('[data-g21-network]');
  let busy = false;
  function enhance() {
    root.querySelectorAll('[data-g21-presets]').forEach(el => { el.hidden = false; });
    const input = root.querySelector('#g21-bet');
    root.querySelectorAll('[data-g21-bet]').forEach(button => {
      button.setAttribute('aria-pressed', String(input && input.value === button.dataset.g21Bet));
    });
  }
  function say(message) { notice.textContent = message; notice.hidden = !message; }
  function replace(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const fresh = template.content.querySelector('[data-g21-content]');
    const old = root.querySelector('[data-g21-content]');
    if (!fresh || !old) throw new Error('Invalid game response');
    old.replaceWith(fresh);enhance();
    return fresh;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-g21-bet]');
    if (!button || busy) return;
    const input = root.querySelector('#g21-bet');
    if (input) { input.value = button.dataset.g21Bet;enhance(); }
  });
  root.addEventListener('input', event => { if (event.target.id === 'g21-bet') enhance(); });
  root.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-g21-form]')) return;
    event.preventDefault();
    if (busy) return;
    if (!form.reportValidity()) return;
    const body = new FormData(form), command = body.get('command');
    busy = true;say('');root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('[data-g21-form] button').forEach(el => { el.disabled = true; });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin', headers: {Accept: 'application/json'}, signal: controller.signal, cache: 'no-store' });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Not a game response');
      const data = await response.json();
      if (typeof data.html === 'string') {
        const fresh = replace(data.html);
        const focus = fresh.querySelector(command === 'hit' ? '[data-g21-focus=hit]' : '[data-g21-status]') || fresh.querySelector('[data-g21-status]');
        focus?.focus({preventScroll: true});
        if (fresh.dataset.phase === 'finished') {
          fresh.querySelector('[data-g21-status]')?.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        }
        say(data.error || '');
      } else {
        say(data.error || 'Не удалось выполнить ход. Обновите страницу.');
      }
    } catch {
      say('Связь прервалась. Нажмите действие ещё раз или обновите страницу: повторная отправка не спишет ставку и не возьмёт лишнюю карту.');
    } finally {
      clearTimeout(timer);busy = false;root.removeAttribute('aria-busy');
      root.querySelectorAll('[data-g21-form] button').forEach(el => { el.disabled = false; });
      const input = root.querySelector('#g21-bet');
      if (input?.disabled) input.form.querySelector('[type=submit]').disabled = true;
    }
  });
  // A cached back/forward page must not silently submit an outdated round.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  enhance();
})();
