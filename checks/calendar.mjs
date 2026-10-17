import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site',fixtures=new URL('./calendar-fixtures/',import.meta.url);
mkdirSync(fixtures,{recursive:true});
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
const stamp=date=>Math.floor(Date.parse(date)/1000),news=(date,id,title='Новость')=>`${title}|Текст||${stamp(date)}|CalendarAdmin|${id}|\n`;
const count=html=>(html.match(/calendar-has-news/g)||[]).length;
let cases=0,requests=0;
try{
 copy(root,'/www');php.mkdir('/calendar-data');
 await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false','date.timezone':'UTC'});
 async function render(data,now='2024-02-29T12:00:00Z',shift=0){
  if(data===null){if(php.fileExists('/calendar-data/news.dat'))php.unlink('/calendar-data/news.dat');}else php.writeFile('/calendar-data/news.dat',data);
  const r=await php.run({code:`<?php define('SID','');define('BASEDIR','/www/');define('DATADIR','/calendar-data/');define('SITETIME',${stamp(now)});$config=['timeclocks'=>${shift}];require '/www/includes/functions.php';include '/www/includes/calendar.php';`});
  cases++;assert.equal(r.errors,'');assert.equal(r.exitCode,0);assert.ok(!/Fatal error|Warning:|Deprecated:/.test(r.text));
  if(data!==null)assert.equal(php.readFileAsText('/calendar-data/news.dat'),data,'calendar does not write news');
  return r.text;
 }
 const leap=news('2024-02-29T09:00:00Z',29)+news('2024-02-03T09:00:00Z',3)+news('2024-01-31T23:59:59Z',31)+news('2024-03-01T00:00:00Z',1);
 let html=await render(leap);assert.equal(count(html),2);assert.match(html,/<a class="calendar-day calendar-today calendar-has-news"[^>]*id=29[^>]*aria-current="date"/);assert.match(html,/id=3"/);assert.ok(!/id=(31|1)"/.test(html));assert.equal((html.match(/class="calendar-day-number"/g)||[]).length,29);
 html=await render('');assert.equal(count(html),0);assert.match(html,/<span class="calendar-day calendar-today" aria-current="date"/);
 html=await render(null);assert.equal(count(html),0);
 html=await render(news('2024-02-12T12:00:00Z',8)+news('2024-02-12T09:00:00Z',9));assert.equal(count(html),1);assert.match(html,/id=9"/);
 html=await render('broken\n\nX|T||bad|User|4|\nX|T||1709208000|User|4\" onclick=\"alert(1)|\nX|T||1709208000|User|../4|\nX|T||999999999999999999999999999999|User|5|\n'+news('2024-02-20T12:00:00Z',20,'<script>alert(1)</script>'));
 assert.equal(count(html),1);assert.ok(!/onclick|<script|\.\.\//.test(html));assert.match(html,/id=20"/);
 html=await render(news('2024-02-29T23:00:00Z',10),'2024-03-01T01:00:00Z',9);assert.equal(count(html),1);assert.match(html,/<a class="calendar-day calendar-today calendar-has-news"[^>]*id=10/);
 html=await render(news('2024-03-01T01:00:00Z',11),'2024-03-01T02:00:00Z',-9);assert.equal(count(html),1);assert.match(html,/>29<\/span>/);
 html=await render(news('2023-12-31T23:00:00Z',12),'2024-01-01T01:00:00Z',9);assert.equal(count(html),1);assert.match(html,/<a class="calendar-day calendar-today calendar-has-news"[^>]*id=12/);
 html=await render('', '2023-02-15T12:00:00Z');assert.equal((html.match(/class="calendar-day-number"/g)||[]).length,28);
 console.log('PASS calendar: today remains linked, circles only for news, leap/year/month boundaries, timezone shifts, empty/missing/malformed records and read-only rendering');
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function req(url,body){php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));const r=await handler.request({url,...(body?{method:'POST',body}:{})});requests++;assert.equal(r.errors,'',url);return r;}
 await req('/index.php');await req('/INSTALL.php');const password=randomBytes(10).toString('hex');await req('/INSTALL.php?action=install',{name:'CalendarAdmin',password,password2:password,oemails:'calendar@example.test',osite:'https://motor.test'});assert.ok(php.fileExists('/www/local/profil/CalendarAdmin.prof'));
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57])cfg[i]='0';cfg[85]='1';php.writeFile('/www/local/config.dat',cfg.join('|'));
 const current=await php.run({code:'<?php echo time();'}),now=+current.text;
 php.writeFile('/www/local/news.dat',`Сегодня|Текст||${now}|CalendarAdmin|1|\n`);
 let r=await req('/index.php');assert.equal(r.httpStatusCode,200);assert.match(r.text,/calendar-today calendar-has-news/);assert.match(r.text,/site\.css\?v=calendar1/);writeFileSync(new URL('home.html',fixtures),r.text);
 r=await req('/news/komm.php?id=1');assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('Сегодня'));
 r=await req('/index.php?month=%22%3E%3Cscript%3Ealert(1)%3C/script%3E&year[]=2024');assert.equal(r.httpStatusCode,302);assert.ok(r.headers.location[0].includes('isset=403'));assert.ok(!r.text.includes('<script>alert(1)</script>'));
 console.log('PASS actual homepage integration, news destination and malformed query rejection');
 writeFileSync(new URL('./calendar-results.json',import.meta.url),JSON.stringify({php:'8.4',renderCases:cases,httpRequests:requests,todayLinked:true,dateBoundaries:true,malformedDataSafe:true,sourceUnchanged:true},null,2));
}finally{php.exit();}
