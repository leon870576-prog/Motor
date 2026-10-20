import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { File } from 'node:buffer';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2] || fileURLToPath(new URL('../site',import.meta.url));
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
function copy(from,to){ if(!php.fileExists(to))php.mkdir(to); for(const e of readdirSync(from,{withFileTypes:true})){ const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f)); } }
const hash=x=>createHash('sha256').update(x).digest('hex');
let requests=0,passed=[],smoking=false,smokeErrors=[];
const pass=x=>{passed.push(x);console.log('PASS',x)};
try{
copy(root,'/www');
await setPhpIniEntries(php,{upload_max_filesize:'32M',post_max_size:'64M',max_file_uploads:'20',allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 if(url==='/input.php?action=exit' && !body){const form=await req('/pages/themes.php');const token=form.text.match(/name="uid" value="([^"]+)"/);assert.ok(token,'logout form token');body={uid:token[1]};}
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname.replace(/\/$/,'/index.php')));
 // Build a byte-correct multipart body: runtime's helper counts Unicode characters as bytes.
 if(body && !(body instanceof Uint8Array) && typeof body==='object'){
  const boundary='MotorTest'+randomBytes(12).toString('hex'),chunks=[];
  for(const [name,value] of Object.entries(body)){
   chunks.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"'+(value instanceof File?'; filename="'+value.name+'"':'')+'\r\n'+(value instanceof File?'Content-Type: application/octet-stream\r\n':'')+'\r\n'));
   chunks.push(value instanceof File?Buffer.from(await value.arrayBuffer()):Buffer.from(String(value)));chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(chunks));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
 }
 const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});
 requests++;if(smoking){if(r.errors||r.exitCode!==0||r.httpStatusCode>=500)smokeErrors.push({url,status:r.httpStatusCode,errors:r.errors,exit:r.exitCode});}else{assert.equal(r.errors,'',url);assert.ok(r.exitCode===0,url+' exit '+r.exitCode);}return r;
}
function lines(path){return php.readFileAsText('/www/local/'+path).split(/\r?\n/).filter(Boolean)}
function manifest(section,parent){return JSON.parse(php.readFileAsText('/www/local/attachments/'+section+'/'+parent+'/manifest.json'))}
function url(section,parent,id){return '/attachment.php?section='+section+'&parent='+parent+'&file='+id}
async function token(){const r=await req('/pages/themes.php');return r.text.match(/name="uid" value="([^"]+)"/)[1]}
const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'SecureAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
let before=await token();let r=await req('/input.php',{login:'SecureAdmin',pass:password,cookietrue:'1'});assert.equal(r.httpStatusCode,302);
assert.ok(r.headers['set-cookie'].some(x=>x.startsWith('SID=')),'session ID regenerated');for(const name of ['cooklog','cookpar']){const c=r.headers['set-cookie'].find(x=>x.startsWith(name+'='));assert.ok(/secure/i.test(c)&&/httponly/i.test(c)&&/samesite=lax/i.test(c),name);}
let uid=await token();assert.notEqual(uid,before);assert.equal((await req('/input.php?login=SecureAdmin&pass='+password)).httpStatusCode,405);
pass('login rotates session ID and CSRF token; remembered cookies Secure/HttpOnly/SameSite; GET credentials rejected');
const adminProfile=php.readFileAsText('/www/local/profil/SecureAdmin.prof');let member=adminProfile.split(':||:');member[0]='SecureMember';member[7]='0';member[25]='1';member[36]='500';member[41]='10000';member[75]='0';member[6]='1';php.writeFile('/www/local/profil/SecureMember.prof',member.join(':||:'));php.writeFile('/www/local/privat/SecureMember.priv','');

const decode=s=>s.replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&quot;/g,'"');
const bad=[],references=new Set(),pages=new Set(),skipped=new Set(),statusErrors=[],expectedDiagnostics=[];
const mutating=/^(add|del|edit|send|go|save|clear|alloutdel|outdel|restatement|choice|skan|reload|move|lockedtopic|closedtopic|unzip|create|vote|operacia|upgrade|razban|zaban|sub|bilet|hi|ini|game|shop|select|addload|download|exit)/;
const seeds=['/index.php','/pages/index.php?action=menu','/pages/userpage.php?uz=SecureMember','/pages/anketa.php?view=details&uz=SecureMember'];
for(const dir of ['pages','games','mpanel','board','book','chat','forum','gallery','news','votes','mail','wap','www'])for(const name of readdirSync(join(root,dir))){
 if(!name.endsWith('.php'))continue;const path='/'+dir+'/'+name;
 if(/\/(add|edit|newpass|nickname|reguser|resize|fullsize|avators|count|count24|count31|grafic|level|protect|updates)\.php$/.test(path))continue;
 seeds.push(path);
}
for(const role of ['guest','SecureMember','SecureAdmin']){
 await req('/input.php?action=exit');if(role!=='guest')await req('/input.php',{login:role,pass:password});
 const queue=[...seeds],seen=new Set();
 while(queue.length){
  const path=queue.shift();if(seen.has(path))continue;seen.add(path);
  if(seen.size>900)throw Error('crawl bound exceeded');
  smoking=true;let r=await req(path);smoking=false;pages.add(role+':'+path);
  if(r.httpStatusCode>=500)statusErrors.push({role,path,status:r.httpStatusCode});
  const base=new URL(path,'https://motor.test');
  for(const m of r.text.replace(/<(textarea|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi,'').matchAll(/<(a|img|script|link|form|source|video)\b[^>]*?\b(href|src|action)\s*=\s*["']([^"']*)["']/gi)){
   const target=decode(m[3]);let u;try{u=new URL(target,base)}catch{bad.push({path,target,reason:'invalid URL'});continue;}
   if(u.origin!==base.origin)continue;
   let fsPath=decodeURIComponent(u.pathname);if(fsPath.endsWith('/'))fsPath+='index.php';
   // Runtime-owned mutable assets are validated using the actual isolated filesystem.
   if(path==='/pages/index.php?action=test' && ['/check','/local'].includes(u.pathname)){expectedDiagnostics.push(u.pathname);continue;}
   if(!php.fileExists('/www'+fsPath)){bad.push({role,path,target:u.pathname,reason:'missing target'});continue;}
   references.add(u.pathname);
   if(m[1].toLowerCase()!=='a'||!fsPath.endsWith('.php'))continue;
   const action=u.searchParams.get('action')||u.searchParams.get('act')||'';
   if(mutating.test(action)||u.searchParams.has('uid')||/INSTALL\.php|\/(newpass|nickname|reguser|update|del)\.php/.test(fsPath)){skipped.add(u.pathname+'?action='+action);continue;}
   for(const key of ['SID','uid','PHPSESSID','isset','rand'])u.searchParams.delete(key);
   const next=u.pathname+(u.searchParams.size?'?'+u.searchParams.toString():'');
   if(!seen.has(next)&&!queue.includes(next))queue.push(next);
  }
 }
}
const report={runtime:'PHP 8.4 WASM',requests,pages:pages.size,uniqueTargets:references.size,skippedMutations:skipped.size,expectedDiagnostics:[...new Set(expectedDiagnostics)],broken:[...new Map(bad.map(x=>[x.path+'|'+x.target,x])).values()],statusErrors,phpErrors:smokeErrors,scope:'Rendered internal href/src/action references, local isolated guest/member/admin navigation; no external URLs fetched and no destructive links followed'};
writeFileSync(new URL('./link-audit-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));assert.deepEqual(report.broken,[]);assert.deepEqual(statusErrors,[]);assert.deepEqual(smokeErrors,[]);
}finally{php.exit()}
