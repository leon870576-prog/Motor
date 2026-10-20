import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtures=new URL('./home-template-fixtures/',import.meta.url);mkdirSync(fixtures,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(?:0*39|x27);/gi,"'").replace(/&amp;/g,'&');
const editor='/mpanel/files.php?action=edit&file=index.dat',save='/mpanel/files.php?action=editfile&file=index.dat';
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
 const raw=()=>php.readFileAsText('/www/local/datamain/index.dat'),seed=raw(),standard=readFileSync(root+'/includes/lesika/home.php','utf8');
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'TemplateOwner',password,password2:password,oemails:'owner@example.test',osite:'https://motor.test'});
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
 const profile=php.readFileAsText('/www/local/profil/TemplateOwner.prof').split(':||:');
 for(const[name,role]of [['TemplateMember',0],['TemplateOtherOwner',101],['TemplateAdmin',102],['TemplateMod',103]]){const p=[...profile];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
 async function token(){return (await req('/pages/themes.php')).text.match(/name="uid" value="([^"]+)"/)[1];}
 async function login(name){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();if(name){assert.equal((await req('/input.php',{login:name,pass:password})).httpStatusCode,302);logged=true;uid=await token();}}
 function form(r){const source=r.text.match(/<textarea[^>]*name="msg"[^>]*>([\s\S]*?)<\/textarea>/);assert.ok(source);return {uid,operation:'save',version:r.text.match(/name="version" value="([a-f0-9]{64})"/)[1],msg:decode(source[1])};}
 const section=s=>s.slice(s.indexOf('<div class="home-sections">'),s.indexOf('</section>',s.indexOf('<section class="neighbors">'))+10);
 const fresh=async()=>form(await req(editor));
 for(const name of [null,'TemplateMember','TemplateOtherOwner','TemplateAdmin','TemplateMod']){
  await login(name);const r=await req(editor);assert.ok([302,403].includes(r.httpStatusCode),String(name));assert.ok(!r.text.includes('name="msg"'));assert.ok([302,403].includes((await req(save,{uid,version:hash('bad'),msg:standard})).httpStatusCode));assert.equal(raw(),seed);
 }
 await login('TemplateOwner');let r=await req(editor),f=form(r);assert.equal(f.msg,standard);assert.notEqual(f.msg,seed);assert.match(r.text,/href="\.\.\/index.php"/);assert.match(r.text,/href="home-settings.php"/);assert.match(r.text,/home\.css\?v=home5/);
 writeFileSync(new URL('editor.html',fixtures),r.text);
 const initial=section((await req('/index.php')).text);assert.match(initial,/section-card/);assert.match(initial,/В нашем городе/);
 await req(editor,undefined,{},'HEAD');await req('/mpanel/files.php?action=obzor&file=index.dat');await req('/index.php',undefined,{},'HEAD');assert.equal(raw(),seed);assert.equal(php.fileExists('/www/local/home-template-backups'),false);
 assert.ok((await req('/mpanel/home-settings.php')).text.includes('files.php?action=edit&amp;file=index.dat'));
 pass('only configured owner edits template; editor/source preview/public page share actual modern template; GET and HEAD do not write');
 for(const [body,headers,status]of [[{...f,uid:'bad'},{},403],[f,{Origin:'https://outside.test'},403],[{...f,'msg[]':'array'},{},400],[{...f,version:'invalid'},{},400],[{...f,msg:'<?php if ('},{},400],[{...f,msg:''},{},400],[{...f,msg:'x'.repeat(262145)},{},400]]){assert.equal((await req(save,body,headers)).httpStatusCode,status);assert.equal(raw(),seed);}
 assert.equal((await req(save+'&uid='+uid)).httpStatusCode,403);assert.equal(raw(),seed);
 assert.equal((await req(save,f)).httpStatusCode,303);assert.equal(raw(),standard);assert.equal(section((await req('/index.php')).text),initial);
 const backup=hash(seed)+'.dat';assert.equal(php.readFileAsText('/www/local/home-template-backups/'+backup),seed);assert.equal(php.readFileAsText('/www/local/home-template-backups/'+hash(standard)+'.dat'),standard);
 assert.equal(await run('echo decoct(fileperms("/www/local/home-template-backups/'+backup+'") & 0777);'),'600');
 pass('POST/CSRF/Origin/arrays/size/syntax guards; unchanged save preserves modern design and creates exact private backups');
 const outsideBefore=php.readFileAsText('/www/local/news.dat'),settingsBefore=php.fileExists('/www/local/home-settings.json')?php.readFileAsText('/www/local/home-settings.json'):null;
 f=await fresh();const stale={...f};
 const literal='<?php /* </textarea><script>window.templateInjected=1</script> &amp; &quot; $test \\ end */ ?>\n';
 const edited=literal+standard.replace('В нашем городе','Городские разделы')+'\nif (true && true) echo "<p id=literal>A &amp; B</p>";';
 assert.equal((await req(save,{...f,msg:edited})).httpStatusCode,303);assert.equal(raw(),edited);r=await req(editor);assert.equal(form(r).msg,edited);assert.ok(!r.text.includes('<script>window.templateInjected=1</script>'));
 writeFileSync(new URL('edited.html',fixtures),r.text);
 r=await req('/index.php');assert.match(r.text,/Городские разделы/);assert.match(r.text,/A &amp; B/);assert.match(r.text,/data-home-block="news"/);
 assert.equal((await req(save,{...stale,msg:standard+'\n'})).httpStatusCode,409);assert.equal(raw(),edited);
 f=await fresh();const invalid='<?php if (';r=await req(save,{...f,msg:invalid});assert.equal(r.httpStatusCode,400);assert.ok(r.text.includes('&lt;?php if ('));assert.equal(raw(),edited);writeFileSync(new URL('error.html',fixtures),r.text);
 assert.equal((await req(save,{...f,operation:'standard'})).httpStatusCode,303);assert.equal(raw(),standard);assert.equal(section((await req('/index.php')).text),initial);assert.equal(php.readFileAsText('/www/local/home-template-backups/'+hash(edited)+'.dat'),edited);
 assert.equal(php.readFileAsText('/www/local/news.dat'),outsideBefore);assert.equal(php.fileExists('/www/local/home-settings.json')?php.readFileAsText('/www/local/home-settings.json'):null,settingsBefore);
 pass('literal ampersands, PHP operators and textarea payload roundtrip exactly; edits visible; stale forms rejected; standard reset retains settings/content');
 f=await fresh();
 for(const target of ['datamain/index.dat','datamain','home-template.lock','home-template-backups']){
  await run('rename("/www/local/'+target+'","/tmp/kept");file_put_contents("/tmp/outside","untouched");symlink("/tmp/outside","/www/local/'+target+'");');
  assert.equal((await req(save,{...f,msg:standard+'\n'})).httpStatusCode,503,target);assert.equal(php.readFileAsText('/tmp/outside'),'untouched');
  await run('unlink("/www/local/'+target+'");rename("/tmp/kept","/www/local/'+target+'");');assert.equal(raw(),standard);
 }
 const backupPath='/www/local/home-template-backups/'+hash(standard)+'.dat';php.writeFile(backupPath,'corrupt');assert.equal((await req(save,{...f,msg:standard+'\n'})).httpStatusCode,503);assert.equal(raw(),standard);php.writeFile(backupPath,standard);
 php.writeFile('/www/local/datamain/index.dat','<?php echo "partial"; throw new RuntimeException("PRIVATE-DETAIL");');r=await req('/index.php');assert.equal(r.httpStatusCode,503);assert.ok(!r.text.includes('PRIVATE-DETAIL'));assert.ok(!r.text.includes('partial'));assert.match(r.text,/Открыть редактор/);
 f=await fresh();assert.equal((await req(save,{...f,operation:'standard'})).httpStatusCode,303);assert.equal((await req('/index.php')).httpStatusCode,200);
 assert.equal((await req('/pages/index.php?action=index')).httpStatusCode,302);
 pass('symlink target/directory/lock/backups and corrupt backups refused; failed runtime template remains repairable; preview resolves to homepage');
 writeFileSync(new URL('./home-template-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2));console.log('SUCCESS',requests,'homepage template/editor HTTP checks');
}finally{php.exit();}
