/* Chat updates preserve the composer, selection and reading position. */
(() => {
 'use strict';
 const root=document.querySelector('#chat-live');if(!root)return;
 const feed=root.querySelector('#chat-feed'),status=root.querySelector('[data-chat-status]'),newButton=root.querySelector('[data-chat-new]');
 const navigation=root.querySelector('[data-chat-navigation]'),form=document.querySelector('[data-chat-form]');
 const textarea=form?.querySelector('textarea[name="msg"]'),sendStatus=form?.querySelector('[data-chat-send-status]');
 const endpoint=new URL(root.dataset.endpoint,location.href);if(endpoint.origin!==location.origin)return;
 let revision=root.dataset.revision,enabled=root.dataset.enabled==='1',interval=Number(root.dataset.interval)*1000;
 let history=Number(root.dataset.start)>0;const token=root.dataset.token;
 let timer=0,busy=false,sending=false,controller=null,failures=0,epoch=0,stopped=false;
 const text=s=>{if(status.textContent!==s)status.textContent=s;};
 function schedule(){clearTimeout(timer);if(enabled&&!stopped&&!document.hidden&&navigator.onLine)timer=setTimeout(poll,Math.min(30000,interval*2**Math.min(failures,4)));}
 function showSent(id){
  if(!/^[a-f0-9]{32}$/.test(id))return;
  const message=feed.querySelector(`[data-chat-id="${id}"]`);if(!message)return;
  newButton.hidden=true;
  message.focus({preventScroll:true});
  requestAnimationFrame(()=>message.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
 }
 function apply(data){
  if(!data || !/^[a-f0-9]{64}$/.test(data.revision) || typeof data.html!=='string' || !Array.isArray(data.ids))throw new Error('Неверный ответ чата');
  enabled=Boolean(data.enabled);interval=Math.max(2000,Math.min(30000,Number(data.interval)*1000||3000));
  if(data.revision===revision)return;
  revision=data.revision;root.dataset.revision=revision;
  if(history){newButton.hidden=false;newButton.textContent='Есть изменения • К последним сообщениям';return;}
  const doc=new DOMParser().parseFromString(data.html,'text/html');
  const incoming=[...doc.querySelectorAll('body > .chat-message')];
  if(incoming.some(e=>!/^[a-f0-9]{32}$/.test(e.dataset.chatId)))throw new Error('Неверное сообщение');
  const old=new Map([...feed.querySelectorAll('.chat-message')].map(e=>[e.dataset.chatId,e]));
  const added=incoming.filter(e=>!old.has(e.dataset.chatId)).length;
  const reading=[...old.values()].find(e=>e.getBoundingClientRect().bottom>100);
  const composer=document.querySelector('[data-chat-composer]');
  const anchor=document.activeElement===textarea?composer:(reading && incoming.some(e=>e.dataset.chatId===reading.dataset.chatId)?reading:composer);
  const preserve=scrollY>Math.max(0,feed.getBoundingClientRect().top+scrollY-110)||document.activeElement===textarea;
  const top=anchor?.getBoundingClientRect().top,scroll=scrollY;
  const htmlStyle=document.documentElement.style,oldAnchor=htmlStyle.overflowAnchor,oldBehavior=htmlStyle.scrollBehavior;
  htmlStyle.overflowAnchor='none';htmlStyle.scrollBehavior='auto';
  const nodes=incoming.map(e=>{
   const previous=old.get(e.dataset.chatId);if(previous && previous.innerHTML===e.innerHTML)return previous;
   if(previous){previous.replaceChildren(...e.childNodes);return previous;}return e;
  });
  if(added && preserve){newButton.hidden=false;newButton.textContent=`Новых сообщений: ${added} • Показать`;}
  feed.replaceChildren(...nodes);
  if(!nodes.length){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent='Сообщений нет, будь первым!';feed.append(empty);}
  const navDoc=new DOMParser().parseFromString(data.navigation||'','text/html');navigation.replaceChildren(...navDoc.body.childNodes);
  if(preserve && anchor?.isConnected && Number.isFinite(top))window.scrollTo(0,window.scrollY+anchor.getBoundingClientRect().top-top);
  else window.scrollTo(0,scroll);
  requestAnimationFrame(()=>{htmlStyle.overflowAnchor=oldAnchor;htmlStyle.scrollBehavior=oldBehavior;});
 }
 async function poll(manual=false){
  clearTimeout(timer);
  if(stopped||busy||sending||document.hidden||!navigator.onLine||(!enabled&&!manual)){schedule();return;}
  busy=true;const current=++epoch;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
  try{
   const url=new URL(endpoint),options={credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}};
   if(token){options.method='POST';options.body=new URLSearchParams({uid:token,revision});}
   else url.searchParams.set('revision',revision);
   const response=await fetch(url,options);
   if(current!==epoch)return;
   if(response.redirected || [401,403].includes(response.status)){stopped=true;text('Сеанс изменился. Обновите страницу, сохранив набранный текст.');return;}
   if(response.status!==204){if(!response.ok)throw new Error('Связь с чатом прервана');apply(await response.json());}
   failures=0;text(enabled?'Автообновление включено':'Автообновление выключено');
  }catch(error){if(current===epoch && !stopped){failures++;text('Нет связи. Повторим обновление автоматически.');}}
  finally{clearTimeout(timeout);if(current===epoch){busy=false;controller=null;schedule();}}
 }
 document.querySelector('[data-chat-refresh]')?.addEventListener('click',event=>{if(history)return;event.preventDefault();poll(true);});
 newButton.addEventListener('click',()=>{if(history){location.href='index.php';return;}feed.scrollIntoView({behavior:'smooth',block:'start'});newButton.hidden=true;});
 feed.addEventListener('click',event=>{
  const reply=event.target.closest('[data-chat-reply]');if(!reply||!textarea)return;
  event.preventDefault();const name=reply.dataset.chatReply.replace(/[\[\]\r\n]/g,'');
  textarea.setRangeText(`[b]${name}[/b], `,textarea.selectionStart,textarea.selectionEnd,'end');textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.focus();
 });
 form?.addEventListener('submit',async event=>{
  if(!window.fetch||!window.FormData)return;
  event.preventDefault();if(sending)return;
  clearTimeout(timer);controller?.abort();epoch++;busy=false;sending=true;
  const value=textarea.value,body=new FormData(form),button=form.querySelector('[type="submit"]');button.disabled=true;sendStatus.textContent='Отправляем…';
  const sendController=new AbortController(),timeout=setTimeout(()=>sendController.abort(),15000);
  try{
   const response=await fetch(form.action,{method:'POST',body,credentials:'same-origin',cache:'no-store',signal:sendController.signal,headers:{Accept:'application/json'}});
   if(response.redirected || !(response.headers.get('Content-Type')||'').includes('application/json'))throw new Error('Обновите страницу после сохранения текста и проверьте вход на сайт.');
   const data=await response.json();
   if(!response.ok){if(response.status===409 && /^[a-f0-9]{32}$/.test(data.message_id))form.elements.message_id.value=data.message_id;throw new Error(data.error||'Не удалось отправить сообщение.');}
   if(history){history=false;root.dataset.start='0';revision='';newButton.hidden=true;}
   apply(data);
   if(textarea.value===value)textarea.value='';
   if(/^[a-f0-9]{32}$/.test(data.message_id))form.elements.message_id.value=data.message_id;
   sendStatus.textContent='Сообщение добавлено';failures=0;
   showSent(data.sent_message_id||body.get('message_id'));
  }catch(error){sendStatus.textContent=error.name==='AbortError'?'Ответ задерживается. Текст остался в поле — можно повторить отправку.':error.message;}
  finally{clearTimeout(timeout);sending=false;button.disabled=false;schedule();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);controller?.abort();}else if(enabled)poll();});
 window.addEventListener('offline',()=>{clearTimeout(timer);controller?.abort();text('Нет сети. Обновление продолжится после подключения.');});
 window.addEventListener('online',()=>{failures=0;if(enabled)poll();});
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);controller?.abort();});
 window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;schedule();}});
 schedule();
})();
