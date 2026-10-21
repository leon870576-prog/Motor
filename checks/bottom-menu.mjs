import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtures=new URL('./bottom-menu-fixtures/',import.meta.url);mkdirSync(fixtures,{recursive:true});
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(?:0*39|x27);/gi,"'").replace(/&#([0-9]+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&');
let requests=0,uid='',logged=false;const passed=[],pass=s=>{passed.push(s);console.log('PASS',s)};
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
 copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false'});
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function req(url,body,headers={},method){
  php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
  if(body&&typeof body==='object'){
   const boundary='Template'+randomBytes(8).toString('hex'),parts=[];
   for(const[k,v]of Object.entries(body))parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+String(v)+'\r\n'));
   parts.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(parts));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
  }
  const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,r.text);return r;
 }
 async function run(code){const r=await php.run({code:'<?php '+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0,r.text);return r.text;}
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'BottomOwner',password,password2:password,oemails:'owner@example.test',osite:'https://motor.test'});
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
 const initialNews=php.readFileAsText('/www/local/news.dat');
 const profile=php.readFileAsText('/www/local/profil/BottomOwner.prof').split(':||:');
 for(const[name,role]of [['BottomMember',0],['BottomOther',101],['BottomAdmin',102]]){const p=[...profile];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
 async function token(){return (await req('/pages/themes.php')).text.match(/name="uid" value="([^"]+)"/)[1];}
 async function login(name){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();if(name){assert.equal((await req('/input.php',{login:name,pass:password})).httpStatusCode,302);logged=true;uid=await token();}}
 function form(r){const html=r.text.match(/<form method="post" action="bottom-menu.php">([\s\S]*?)<\/form>/)[1],f={uid};for(const m of html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g))f[m[1]]=decode(m[2]);for(const m of html.matchAll(/<select name="([^"]+)">([\s\S]*?)<\/select>/g))f[m[1]]=decode(m[2].match(/<option value="([^"]*)" selected/)[1]);return f;}
 const admin='/mpanel/bottom-menu.php',file='/www/local/bottom-menu.json',nav=r=>r.text.match(/<nav class="bottom-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 const items=r=>Array.from(nav(r).matchAll(/<a href="([^"]+)"[^>]*><svg[\s\S]*?<span>([\s\S]*?)<\/span><\/a>/g),m=>({href:decode(m[1]),label:decode(m[2]),active:m[0].includes('aria-current="page"')}));
 for(const name of ['', 'BottomMember','BottomOther','BottomAdmin']){await login(name);assert.equal((await req(admin)).httpStatusCode,403);assert.equal((await req(admin,{uid,operation:'defaults'})).httpStatusCode,403);assert.equal(php.fileExists(file),false);}
 await login('BottomOwner');let r=await req(admin),f=form(r);const defaults={...f};assert.equal(f.label_1,'Главная');assert.equal(f.label_5,'Темы');assert.match((await req('/mpanel/index.php')).text,/bottom-menu.php/);assert.match((await req('/mpanel/setting.php')).text,/bottom-menu.php/);
 r=await req('/index.php');assert.deepEqual(items(r).map(x=>x.label),['Главная','Новости','Форум','Гостевая','Темы']);assert.deepEqual(items(r).map(x=>x.href),['index.php','news/index.php','forum/index.php','book/index.php','pages/themes.php']);assert.ok(items(r)[0].active);writeFileSync(new URL('default.html',fixtures),r.text);await req(admin,undefined,{},'HEAD');assert.equal(php.fileExists(file),false);
 pass('owner-only menu administration; default five links and active item preserved; GET/HEAD do not create settings; admin links present');
 const initialConfig=php.readFileAsText('/www/local/config.dat');
 for(const [change,status,headers]of [[{uid:'bad'},403,{}],[{},403,{Origin:'https://evil.test'}],[{'label_1[]':'bad'},400,{}],[{label_1:''},400,{}],[{label_1:'я'.repeat(25)},400,{}],[{label_1:'two\nlines'},400,{}],[{position_1:'2'},400,{}],[{position_1:'0'},400,{}],[{enabled_1:'yes'},400,{}],[{target_1:'javascript:alert(1)'},400,{}],[{target_1:'pages/index.php?action=menu'},400,{}],[{icon_1:'<svg onload=alert(1)>'},400,{}],[{version:'bad'},400,{}],[{operation:'delete'},400,{}]]){assert.equal((await req(admin,{...f,...change},headers)).httpStatusCode,status);assert.equal(php.fileExists(file),false);}
 const saved={...f,label_1:'<img src=x onerror=a()>',target_1:'chat',icon_1:'forum',position_1:'5',position_5:'1',enabled_4:'0',label_2:'Новости & события',label_3:'Форум обсуждений'};assert.equal((await req(admin,saved)).httpStatusCode,303);const raw=php.readFileAsText(file);r=await req(admin);f=form(r);assert.equal(f.label_1,saved.label_1);assert.equal(f.target_1,'chat');writeFileSync(new URL('admin.html',fixtures),r.text);
 r=await req('/chat/index.php');let links=items(r);assert.deepEqual(links.map(x=>x.label),['Темы','Новости & события','Форум обсуждений','<img src=x onerror=a()>']);assert.equal(links[3].href,'../chat/index.php');assert.equal(links[3].active,true);assert.ok(!nav(r).includes('<img src=x'));assert.match(r.text,/grid-template-columns:repeat\(4,/);writeFileSync(new URL('custom.html',fixtures),(await req('/index.php')).text);
 assert.equal((await req(admin,saved)).httpStatusCode,409);assert.equal(php.readFileAsText(file),raw);
 pass('renaming, links, icons, order and hidden items applied together; escaped HTML/ampersands; invalid inputs rejected; stale forms cannot overwrite a saved menu');
 const targets=JSON.parse(await run('define("BASEDIR","/www/");define("DATADIR","/www/local/");require "/www/includes/bottom-menu.php";echo json_encode(motor_bottom_targets());'));
 for(const[target,[label,url]]of Object.entries(targets)){f=form(await req(admin));assert.equal((await req(admin,{...f,target_1:target,label_1:label})).httpStatusCode,303);r=await req('/'+url);assert.ok([200,302].includes(r.httpStatusCode),url);assert.ok(!String(r.headers.location||'').includes('isset=404'),url);if(r.httpStatusCode===200){assert.equal(items(r).find(x=>x.label===label)?.active,true,url);}}
 f=form(await req(admin));assert.equal((await req(admin,{...f,target_1:'menu',label_1:'Моё меню'})).httpStatusCode,303);r=await req('/pages/index.php?action=info');assert.equal(items(r).find(x=>x.label==='Моё меню').active,false);
 assert.equal(await run('define("BASEDIR","/www/");define("DATADIR","/www/local/");require "/www/includes/functions.php";require "/www/includes/bottom-menu.php";require "/www/includes/request-security.php";$_SERVER["SCRIPT_NAME"]="/portal/pages/index.php";echo motor_bottom_active("menu",motor_request_route(),["action"=>"menu"])?"yes":"no";'),'yes');
 pass('all 18 selectable destinations exist; section highlighting follows the target, distinguishes query pages and supports installation in a subdirectory');
 // One visible item and a fully disabled menu have usable layout states.
 f=form(await req(admin));const one={...f,enabled:'1'};for(let i=1;i<=5;i++)one['enabled_'+i]=i===1?'1':'0';assert.equal((await req(admin,one)).httpStatusCode,303);r=await req('/index.php');assert.equal(items(r).length,1);writeFileSync(new URL('one.html',fixtures),r.text);
 f=form(await req(admin));assert.equal((await req(admin,{...f,enabled:'0'})).httpStatusCode,303);r=await req('/index.php');assert.equal(nav(r),'');assert.match(r.text,/data-bottom-menu="off"/);writeFileSync(new URL('off.html',fixtures),r.text);
 f=form(await req(admin));assert.equal((await req(admin,{...f,enabled:'1',enabled_1:'0'})).httpStatusCode,303);assert.equal(nav(await req('/index.php')),'');
 const beforeReset=form(await req(admin));assert.equal((await req(admin,{uid,operation:'defaults',version:beforeReset.version})).httpStatusCode,303);assert.deepEqual(items(await req('/index.php')).map(x=>x.label),['Главная','Новости','Форум','Гостевая','Темы']);assert.equal((await req(admin,{uid,operation:'defaults',version:beforeReset.version})).httpStatusCode,409);assert.notEqual(form(await req(admin)).version,defaults.version);
 pass('one, zero and disabled menu states; standard reset requires POST/CSRF/version and never reuses the initial revision');
 f=form(await req(admin));const current=php.readFileAsText(file);
 for(const target of ['bottom-menu.json','bottom-menu.lock']){await run('rename("/www/local/'+target+'","/tmp/kept");file_put_contents("/tmp/outside","untouched");symlink("/tmp/outside","/www/local/'+target+'");');assert.equal((await req(admin,{...f,label_1:'Changed'})).httpStatusCode,503);assert.equal(php.readFileAsText('/tmp/outside'),'untouched');assert.equal((await req('/index.php')).httpStatusCode,200);await run('unlink("/www/local/'+target+'");rename("/tmp/kept","/www/local/'+target+'");');assert.equal(php.readFileAsText(file),current);}
 for(const bad of ['broken',JSON.stringify({...JSON.parse(current),items:[...JSON.parse(current).items.slice(0,4)]}),JSON.stringify({...JSON.parse(current),enabled:'yes'}),current.replace('"target": "home"','"target": "javascript:alert(1)"')]){php.writeFile(file,bad);assert.equal((await req(admin)).httpStatusCode,503);assert.equal((await req(admin,f)).httpStatusCode,503);r=await req('/index.php');assert.equal(r.httpStatusCode,200);assert.equal(items(r).length,5);assert.ok(!nav(r).includes('javascript:'));assert.equal(php.readFileAsText(file),bad);}
 php.writeFile(file,current);
 const backup=await req('/mpanel/backup.php?action=newbackup',{uid,files:'1'});assert.ok([200,302].includes(backup.httpStatusCode));assert.equal(await run('define("DATADIR","/www/local/");$ok=false;foreach(glob(DATADIR."databackup/*.zip") as $p){$z=new ZipArchive();if($z->open($p)===true){for($i=0;$i<$z->numFiles;$i++)if(basename($z->getNameIndex($i))==="bottom-menu.json")$ok=$z->getFromIndex($i)===file_get_contents(DATADIR."bottom-menu.json");$z->close();}}echo $ok?"yes":"no";'),'yes');
 assert.equal(php.readFileAsText('/www/local/config.dat'),initialConfig);assert.equal(php.readFileAsText('/www/local/news.dat'),initialNews);assert.equal(php.fileExists('/www/local/home-settings.json'),false);
 pass('corrupt and symlink settings fail safely without overwrite; public fallback retains navigation; menu included in real ZIP backup; site settings and news unchanged');
 writeFileSync(new URL('./bottom-menu-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2));console.log('SUCCESS',requests,'bottom menu HTTP checks');
}finally{php.exit();}
