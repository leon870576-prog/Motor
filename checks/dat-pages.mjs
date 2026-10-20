import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtures=new URL('./dat-pages-fixtures/',import.meta.url);mkdirSync(fixtures,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(?:0*39|x27);/gi,"'").replace(/&amp;/g,'&');
const editor=f=>'/mpanel/files.php?action=edit&file='+f,save=f=>'/mpanel/files.php?action=editfile&file='+f;
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
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'DatOwner',password,password2:password,oemails:'owner@example.test',osite:'https://motor.test'});
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
 const initialNews=php.readFileAsText('/www/local/news.dat');
 const profile=php.readFileAsText('/www/local/profil/DatOwner.prof').split(':||:');
 for(const[name,role]of [['DatMember',0],['DatOther',101],['DatAdmin',102]]){const p=[...profile];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
 async function token(){return (await req('/pages/themes.php')).text.match(/name="uid" value="([^"]+)"/)[1];}
 async function login(name){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();if(name){assert.equal((await req('/input.php',{login:name,pass:password})).httpStatusCode,302);logged=true;uid=await token();}}
 function form(r){const source=r.text.match(/<textarea[^>]*name="msg"[^>]*>([\s\S]*?)<\/textarea>/);assert.ok(source);return {uid,version:r.text.match(/name="version" value="([a-f0-9]{64})"/)[1],msg:decode(source[1].replace(/^\n/,''))};}
 const raw=f=>php.readFileAsText('/www/local/datamain/'+f),sources={};for(const f of readdirSync(root+'/local/datamain').filter(f=>f.endsWith('.dat')))sources[f]=raw(f);
 for(const who of [null,'DatMember','DatOther','DatAdmin']){await login(who);assert.equal((await req('/mpanel/files.php')).httpStatusCode,302);assert.equal((await req(editor('menu.dat'))).httpStatusCode,302);assert.equal((await req(save('info.dat'),{uid,msg:'bad',version:hash('bad')})).httpStatusCode,302);}
 await login('DatOwner');let r=await req('/mpanel/files.php');assert.match(r.text,/Все .dat-страницы/);writeFileSync(new URL('list.html',fixtures),r.text);
 let pages={};
 for(const file of Object.keys(sources)){
  r=await req(editor(file));assert.equal(r.httpStatusCode,200,file);const f=form(r);
  const expected=file==='index.dat'?readFileSync(root+'/includes/lesika/home.php','utf8'):sources[file];assert.equal(f.msg,expected,file);
  if(file==='index.dat')continue;
  const url=decode(r.text.match(/<a href="([^"]+)">Посмотреть на сайте<\/a>/)[1]);pages[file]=url;
  assert.equal((await req(new URL(url,'https://motor.test').pathname+new URL(url,'https://motor.test').search)).httpStatusCode,200,url);
  assert.equal((await req(save(file),{...f,msg:f.msg.replaceAll('\r\n','\n')})).httpStatusCode,303,file);assert.equal(raw(file),sources[file]);
  assert.equal((await req('/mpanel/files.php?action=obzor&file='+file)).httpStatusCode,200);await req(editor(file),undefined,{},'HEAD');assert.equal(raw(file),sources[file]);
 }
 assert.equal(pages['arkada.dat'],'../games/index.php');assert.equal(pages['reklama_head.dat'],'../index.php#motor-ad-head');assert.equal(pages['reklama_foot.dat'],'../index.php#motor-ad-foot');
 assert.equal(php.fileExists('/www/local/datamain-backups'),false);
 pass('all ten standard files resolve actual sources; preview routes match games/pages/ad slots; unchanged saves and GET/HEAD preserve bytes; owner-only access');
 let f=form(await req(editor('info.dat'))),prior=raw('info.dat');
 for(const [body,headers,status]of [[{...f,uid:'bad'},{},403],[f,{Origin:'https://evil.test'},403],[{...f,'msg[]':'bad'},{},400],[{...f,msg:'<?php if ('},{},400],[{...f,msg:'x'.repeat(262145)},{},400],[{...f,version:'bad'},{},409]]){assert.equal((await req(save('info.dat'),body,headers)).httpStatusCode,status);assert.equal(raw('info.dat'),prior);}
 assert.equal((await req(save('info.dat')+'&uid='+uid)).httpStatusCode,403);
 const source='<?php /* </textarea><script>window.datInjected=1</script> */ if (true && true) echo "<p>Точный текст &amp; символы</p>"; ?>';
 assert.equal((await req(save('info.dat'),{...f,msg:source})).httpStatusCode,303);assert.equal(raw('info.dat'),source);r=await req(editor('info.dat'));assert.equal(form(r).msg,source);assert.ok(!r.text.includes('<script>window.datInjected=1</script>'));writeFileSync(new URL('editor.html',fixtures),r.text);
 r=await req('/pages/index.php?action=info');assert.match(r.text,/Точный текст &amp; символы/);assert.match(r.text,/class="dat-page"/);writeFileSync(new URL('page.html',fixtures),r.text);
 assert.equal((await req(save('info.dat'),f)).httpStatusCode,409);assert.equal(raw('info.dat'),source);
 assert.equal(php.readFileAsText('/www/local/datamain-backups/info.dat/'+hash(prior)+'.dat'),prior);
 assert.equal(await run('echo decoct(fileperms("/www/local/datamain-backups/info.dat/'+hash(prior)+'.dat")&0777);'),'600');
 pass('source roundtrip, actual public output, PHP syntax/size/CSRF/Origin/array guards, stale edits and exact private backups');
 f=form(await req(editor('buttons.dat')));assert.equal((await req(save('buttons.dat'),{...f,msg:'<p>Кнопки</p>'})).httpStatusCode,303);f=form(await req(editor('buttons.dat')));assert.equal((await req(save('buttons.dat'),{...f,msg:''})).httpStatusCode,303);assert.equal(raw('buttons.dat'),'');
 assert.equal((await req('/mpanel/files.php?action=addnew',{uid,newfile:'extra-page'})).httpStatusCode,303);assert.equal(raw('extra-page.dat'),'');assert.equal((await req('/mpanel/files.php?action=addnew',{uid,newfile:'extra-page'})).httpStatusCode,409);
 f=form(await req(editor('extra-page.dat')));assert.equal((await req(save('extra-page.dat'),{...f,msg:'<p>Моя страница</p>'})).httpStatusCode,303);r=await req('/pages/index.php?action=extra-page');assert.match(r.text,/Моя страница/);assert.match(r.text,/class="dat-page"/);
 assert.equal((await req('/mpanel/files.php?action=del&file=extra-page.dat',{uid,version:f.version})).httpStatusCode,409);f=form(await req(editor('extra-page.dat')));assert.equal((await req('/mpanel/files.php?action=del&file=extra-page.dat',{uid,version:f.version})).httpStatusCode,303);assert.equal(php.fileExists('/www/local/datamain/extra-page.dat'),false);assert.equal((await req('/pages/index.php?action=extra-page')).httpStatusCode,404);
 for(const file of ['index.dat','menu.dat','arkada.dat','reklama_head.dat']){f=form(await req(editor(file)));assert.equal((await req('/mpanel/files.php?action=del&file='+file,{uid,version:f.version})).httpStatusCode,400);assert.equal(raw(file),sources[file]);}
 for(const file of ['../config.dat','config.php','info.dat.bak'])assert.ok([302,400].includes((await req(editor(file))).httpStatusCode));
 pass('empty files can be cleared; custom pages inherit current theme; exclusive create, stale delete and system-page protection preserve navigation');
 // Enable both advertising positions through their actual configuration fields, without altering any other setting.
 for(const [key,index,text]of [['rekhead',72,'TOP-AD'],['rekfoot',73,'BOTTOM-AD']]){
  cfg[index]='1';php.writeFile('/www/local/config.dat',cfg.join('|'));
  const file=key==='rekhead'?'reklama_head.dat':'reklama_foot.dat';f=form(await req(editor(file)));assert.equal((await req(save(file),{...f,msg:'<span>'+text+'</span>'})).httpStatusCode,303);
 }
 r=await req('/index.php');assert.equal((r.text.match(/TOP-AD/g)||[]).length,1);assert.equal((r.text.match(/BOTTOM-AD/g)||[]).length,1);assert.ok(r.text.indexOf('BOTTOM-AD')<r.text.indexOf('<details class="site-stats">'));assert.match(r.text,/id="motor-ad-head"/);assert.match(r.text,/id="motor-ad-foot"/);writeFileSync(new URL('ads.html',fixtures),r.text);
 cfg[72]='0';cfg[73]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));r=await req('/index.php');assert.ok(!r.text.includes('TOP-AD')&&!r.text.includes('BOTTOM-AD'));
 pass('header/footer advertising follows admin switches, renders once in actual positions, footer outside collapsed statistics');
 f=form(await req(editor('info.dat')));
 for(const target of ['datamain/info.dat','datamain','datamain-editor.lock','datamain-backups']){
  await run('rename("/www/local/'+target+'","/tmp/kept");file_put_contents("/tmp/outside","untouched");symlink("/tmp/outside","/www/local/'+target+'");');assert.equal((await req(save('info.dat'),{...f,msg:source+' '})).httpStatusCode,503);assert.equal(php.readFileAsText('/tmp/outside'),'untouched');await run('unlink("/www/local/'+target+'");rename("/tmp/kept","/www/local/'+target+'");');assert.equal(raw('info.dat'),source);
 }
 php.writeFile('/www/local/datamain/info.dat','<?php echo "PARTIAL"; throw new RuntimeException("PRIVATE-DETAIL");');r=await req('/pages/index.php?action=info');assert.equal(r.httpStatusCode,503);assert.ok(!r.text.includes('PRIVATE-DETAIL')&&!r.text.includes('PARTIAL'));assert.equal((await req(editor('info.dat'))).httpStatusCode,200);
 assert.equal(php.readFileAsText('/www/local/news.dat'),initialNews);assert.equal(php.fileExists('/www/local/home-settings.json'),false);
 pass('symlink files/directories/locks/backups refused; runtime failures do not disclose details and remain editable; unrelated news/settings untouched');
 writeFileSync(new URL('./dat-pages-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed,files:Object.keys(sources)},null,2));console.log('SUCCESS',requests,'dat file/editor HTTP checks');
}finally{php.exit();}
