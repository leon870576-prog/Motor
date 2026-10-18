(() => {
  'use strict';
  const root = document.querySelector('#arcade');
  if (!root || !window.fetch || !window.FormData) return;
  const notice = root.querySelector('[data-arcade-network]');
  let busy = false;
  const say = text => { notice.textContent = text; notice.hidden = !text; };
  async function request(url, body) {
    if (busy) return;
    busy = true;say('');root.setAttribute('aria-busy', 'true');
    const disabled = [...root.querySelectorAll('button')].map(el => [el, el.disabled]);
    disabled.forEach(([el]) => { el.disabled = true; });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { method: body ? 'POST' : 'GET', ...(body ? {body} : {}), credentials: 'same-origin', headers: {Accept: 'application/json'}, cache: 'no-store', signal: controller.signal });
      if ([401,403].includes(response.status) || response.redirected) { say('Сессия завершилась или действие недоступно. Обновите страницу и войдите на сайт.');return; }
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Unexpected response');
      const data = await response.json();
      if (typeof data.html === 'string') {
        const template = document.createElement('template');template.innerHTML = data.html;
        const next = template.content.querySelector('[data-arcade-content]');
        if (!next) throw new Error('Invalid game response');
        root.querySelector('[data-arcade-content]').replaceWith(next);
        const target = next.dataset.phase === 'ready' ? next.querySelector('button') : next.querySelector('[data-arcade-status]');
        target?.focus({preventScroll: true});
        target?.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        say(data.error || '');
      } else say(data.error || 'Не удалось выполнить действие. Обновите страницу.');
    } catch {
      say('Связь прервалась. Повторите действие или обновите страницу: повторная отправка не спишет стоимость игры ещё раз.');
    } finally {
      clearTimeout(timer);busy = false;root.removeAttribute('aria-busy');
      disabled.forEach(([el, value]) => { if (el.isConnected) el.disabled = value; });
    }
  }
  root.addEventListener('submit', event => {
    const form = event.target;if (!form.matches('[data-arcade-form]')) return;
    event.preventDefault();if (busy || !form.reportValidity()) return;
    const body = new FormData(form), button = event.submitter;
    if (button?.name) body.set(button.name, button.value);
    request(form.action, body);
  });
  root.addEventListener('click', event => {
    const link = event.target.closest('[data-arcade-new]');if (!link) return;
    event.preventDefault();request(link.href, null);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
})();
