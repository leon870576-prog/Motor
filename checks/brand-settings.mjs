import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtures=new URL('./brand-settings-fixtures/',import.meta.url);mkdirSync(fixtures,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(?:0*39|x27);/gi,"'").replace(/&#([0-9]+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&');
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
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'BrandOwner',password,password2:password,oemails:'owner@example.test',osite:'https://motor.test'});
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
 const initialNews=php.readFileAsText('/www/local/news.dat');
 const profile=php.readFileAsText('/www/local/profil/BrandOwner.prof').split(':||:');
 for(const[name,role]of [['BrandMember',0],['BrandOther',101],['BrandAdmin',102]]){const p=[...profile];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
 async function token(){return (await req('/pages/themes.php')).text.match(/name="uid" value="([^"]+)"/)[1];}
 async function login(name){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();if(name){assert.equal((await req('/input.php',{login:name,pass:password})).httpStatusCode,302);logged=true;uid=await token();}}
 function form(r){const f={uid,version:r.text.match(/name="version" value="([a-f0-9]{64})"/)[1]};for(const name of ['title','subtitle','logo'])f[name]=decode(r.text.match(new RegExp('name="'+name+'"[^>]*value="([^\"]*)"'))[1]);return f;}
 const path='/mpanel/brand-settings.php';
 for(const name of ['', 'BrandMember','BrandOther','BrandAdmin']){await login(name);const before=php.readFileAsText('/www/local/config.dat');assert.equal((await req(path)).httpStatusCode,403);assert.equal((await req(path,{uid,title:'forged'})).httpStatusCode,403);assert.equal(php.readFileAsText('/www/local/config.dat'),before);}
 await login('BrandOwner');let r=await req(path);assert.equal(r.httpStatusCode,200);let f=form(r);assert.equal(f.title,'Лесозаводск онлайн');assert.equal(f.subtitle,'Приморский край · Россия');writeFileSync(new URL('admin.html',fixtures),r.text);
 const initial=php.readFileAsText('/www/local/config.dat');await req(path,undefined,{},'HEAD');assert.equal(php.readFileAsText('/www/local/config.dat'),initial);
 assert.match((await req('/mpanel/index.php')).text,/brand-settings.php/);r=await req('/mpanel/setting.php?action=setone');assert.match(r.text,/brand-settings.php/);for(const n of [11,12,15])assert.ok(!r.text.includes('name="set'+n+'"'));
 pass('one shared config source; owner-only administration and links; fresh installation name and subtitle; GET/HEAD preserve settings');
 for(const [change,status,headers]of [[{uid:'bad'},403,{}],[{},403,{Origin:'https://evil.test'}],[{'title[]':'bad'},400,{}],[{title:''},400,{}],[{title:'я'.repeat(101)},400,{}],[{title:'name\nline'},400,{}],[{version:'bad'},400,{}]]){assert.equal((await req(path,{...f,...change},headers)).httpStatusCode,status);assert.equal(php.readFileAsText('/www/local/config.dat'),initial);}
 for(const logo of ['javascript:alert(1)','data:image/svg+xml;base64,AAA','//evil.test/logo.png','http://evil.test/logo.png','../local/config.dat','images/../local/config.dat','images/missing.png','https://u:p@evil.test/x.png','https://evil.test/x.png#y','images/a.php','https://evil.test/x.png" onerror="alert(1)']){assert.equal((await req(path,{...f,logo})).httpStatusCode,400,logo);assert.equal(php.readFileAsText('/www/local/config.dat'),initial);}
 await run('symlink("/www/images/img/homepage.gif","/www/images/linked.gif");');assert.equal((await req(path,{...f,logo:'images/linked.gif'})).httpStatusCode,400);await run('unlink("/www/images/linked.gif");');
 pass('CSRF, Origin, array, length, control-character and URL guards; traversal, symlinks and missing local images rejected without writes');
 const payload='Город <img src=x onerror=alert(1)> & "Друзья" | 100%';const subtitle='Вместе & рядом';
 assert.equal((await req(path,{...f,title:payload,subtitle,logo:'images/img/homepage.gif'})).httpStatusCode,303);const stored=php.readFileAsText('/www/local/config.dat').split('|');assert.equal(stored.length,initial.split('|').length);for(let i=0;i<stored.length;i++)if(![11,12,15].includes(i))assert.equal(stored[i],initial.split('|')[i],String(i));
 r=await req(path);f=form(r);assert.equal(f.title,payload);assert.equal(f.subtitle,subtitle);assert.equal(f.logo,'images/img/homepage.gif');writeFileSync(new URL('custom-admin.html',fixtures),r.text);
 for(const url of ['/index.php','/news/index.php','/pages/index.php?action=info','/games/index.php','/mpanel/index.php']){r=await req(url);assert.equal(r.httpStatusCode,200);assert.ok(!r.text.includes('<img src=x'));assert.ok(!r.text.includes('Лесозаводск<small>'));assert.match(r.text,/Город &lt;img/);assert.match(r.text,/class="brand"[^>]*>[\s\S]*?images\/img\/homepage.gif/);if(url==='/index.php')writeFileSync(new URL('custom-home.html',fixtures),r.text);}
 r=await req('/news/rss.php');assert.match(r.text,/<image><url>https:\/\/motor.test\/images\/img\/homepage.gif<\/url>/);assert.ok(!r.text.includes('<img src=x'));
 // An unrelated settings change does not invalidate or get overwritten by this form.
 let cfgNow=php.readFileAsText('/www/local/config.dat').split('|');cfgNow[17]='7';php.writeFile('/www/local/config.dat',cfgNow.join('|'));
 assert.equal((await req(path,{...f,title:'Новый город',logo:'https://cdn.example.test/logo.png?a=1&b=2'})).httpStatusCode,303);assert.equal(php.readFileAsText('/www/local/config.dat').split('|')[17],'7');assert.equal((await req(path,{...f,title:'Stale'})).httpStatusCode,409);
 r=await req('/news/index.php');assert.match(r.text,/https:\/\/cdn.example.test\/logo.png\?a=1&amp;b=2/);
 pass('title/subtitle/logo roundtrip with escaped HTML, quotes, delimiters and ampersands; consistent header/favicon/RSS; stale saves refused and unrelated settings retained');
 f=form(await req(path));assert.equal((await req(path,{...f,title:'Лесозаводск',subtitle:'',logo:''})).httpStatusCode,303);r=await req('/index.php');assert.match(r.text,/<span>Лесозаводск<\/span>/);assert.match(r.text,/lesozavodsk.svg/); // Explicit old name must remain editable.
 f=form(await req(path));assert.equal((await req(path,{...f,title:'Лесозаводск онлайн',subtitle:'Приморский край · Россия'})).httpStatusCode,303);
 r=await req('/index.php');writeFileSync(new URL('home.html',fixtures),r.text);r=await req(path);writeFileSync(new URL('admin.html',fixtures),r.text);
 f=form(r);const before=php.readFileAsText('/www/local/config.dat');await run('rename("/www/local/config.dat","/tmp/config-kept");file_put_contents("/tmp/outside","unchanged");symlink("/tmp/outside","/www/local/config.dat");');
 // Exercise the writer directly: the request bootstrap intentionally reads config before routing.
 const blocked=await run('define("BASEDIR","/www/");define("DATADIR","/www/local/");require "/www/includes/functions.php";$config=["configkeys"=>140];try{change_setting([11=>"bad"]);echo "FAIL";}catch(RuntimeException $e){echo "blocked";}');assert.equal(blocked,'blocked');assert.equal(php.readFileAsText('/tmp/outside'),'unchanged');await run('unlink("/www/local/config.dat");rename("/tmp/config-kept","/www/local/config.dat");');assert.equal(php.readFileAsText('/www/local/config.dat'),before);
 const currentFields=php.readFileAsText('/www/local/config.dat').split('|');const legacy={uid,set11:'Stale title',set12:'Stale subtitle',set15:'https://stale.example/logo.png'};for(const i of [1,2,3,8,9,10,13,14,16,29,50,52,57,61,62,69,113,118])legacy['set'+i]=decode(currentFields[i]);
 assert.equal((await req('/mpanel/setting.php?action=editone',legacy)).httpStatusCode,302);const afterLegacy=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [11,12,15])assert.equal(afterLegacy[i],currentFields[i]);
 assert.equal(php.readFileAsText('/www/local/news.dat'),initialNews);assert.equal(php.fileExists('/www/local/home-settings.json'),false);
 pass('default emblem reset, empty subtitle and deliberate custom city title work; symlink settings refused; old basic-settings POST cannot overwrite branding; news and homepage selections unchanged');
 writeFileSync(new URL('./brand-settings-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2));console.log('SUCCESS',requests,'branding settings HTTP checks');
}finally{php.exit();}
