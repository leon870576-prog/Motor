import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {File} from 'node:buffer';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2]||fileURLToPath(new URL('../site',import.meta.url));
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtureDir=new URL('./gallery-fixtures/',import.meta.url);mkdirSync(fixtureDir,{recursive:true});
const fixtures=[],passed=[];let requests=0;
const pass=s=>{passed.push(s);console.log('PASS',s)};
const hash=x=>createHash('sha256').update(x).digest('hex');
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
copy(root,'/www');
await setPhpIniEntries(php,{upload_max_filesize:'32M',post_max_size:'64M',memory_limit:'256M',allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
 if(body && !(body instanceof Uint8Array) && typeof body==='object'){
  const boundary='MotorTest'+randomBytes(12).toString('hex'),chunks=[];
  for(const[name,value]of Object.entries(body)){
   chunks.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"'+(value instanceof File?'; filename="'+value.name+'"':'')+'\r\n'+(value instanceof File?'Content-Type: application/octet-stream\r\n':'')+'\r\n'));
   chunks.push(value instanceof File?Buffer.from(await value.arrayBuffer()):Buffer.from(String(value)));chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(chunks));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
 }
 const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;
 assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,url);return r;
}
async function run(code){const r=await php.run({code:'<?php '+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0);return r;}
const version=r=>r.text.match(/name="record_version" value="([^"]+)"/)[1];
const token=r=>r.text.match(/name="uid" value="([^"]+)"/)[1];
const rows=()=>php.readFileAsText('/www/local/datagallery/fotobase.dat').split(/\r?\n/).filter(Boolean);
const catalog=()=>php.readFileAsText('/www/local/datagallery/fotobase.dat');
const full=id=>'/gallery/fullsize.php?name='+id,preview=id=>'/gallery/resize.php?name='+id,detail=id=>'/gallery/index.php?action=showimg&gid='+id,comments=id=>'/gallery/index.php?action=komm&gid='+id;
const capture=(r,url,role)=>{const file=fixtures.length+'.html';writeFileSync(new URL(file,fixtureDir),r.text);fixtures.push({file,url,role});};
const upload=(bytes,name)=>new File([bytes],name);
const password=randomBytes(10).toString('hex');
await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'MotorTestAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let config=php.readFileAsText('/www/local/config.dat').split('|');config[3]='0';config[29]='0';config[57]='0';config[34]='0';php.writeFile('/www/local/config.dat',config.join('|'));
const template=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:');
for(const role of [0,101,102,103,105]){const p=[...template];p[0]='Role'+role;p[7]=String(role);p[6]='1';p[25]='1';php.writeFile('/www/local/profil/'+p[0]+'.prof',p.join(':||:'));}
let uid;
async function login(role){await req('/input.php?action=exit');await req('/input.php',{login:role===null?'MotorTestAdmin':'Role'+role,pass:password});uid=token(await req('/pages/themes.php'));}
await login(null);
let settingsPage=await req('/mpanel/gallery-settings.php');assert.equal(settingsPage.httpStatusCode,200);
let settings={max_mb:20,max_side:8000,max_mp:24,preview_px:960,quality:82,per_page:6,comments_page:10,comments_max:500,zoom:1,watermark:0,formats:['jpg','jpeg','png','gif','webp']};
async function saveSettings(changes={},extra={}){
 const next={...settings,...changes},r=await req('/mpanel/gallery-settings.php'),body={uid,record_version:version(r)};
 for(const[key,val]of Object.entries(next)){if(Array.isArray(val))val.forEach((v,i)=>body[`formats[${i}]`]=v);else body[key]=String(val);}
 const saved=await req('/mpanel/gallery-settings.php',{...body,...extra});if(saved.httpStatusCode===200)settings=next;return saved;
}
assert.equal((await saveSettings()).httpStatusCode,200);const settingsRaw=php.readFileAsText('/www/local/gallery-settings.json');
assert.equal((await saveSettings({max_mb:33})).httpStatusCode,400);assert.equal((await saveSettings({formats:['php']})).httpStatusCode,400);
assert.equal((await saveSettings({}, {'formats[0][0]':'jpg'})).httpStatusCode,400);
assert.equal((await saveSettings({max_mp:25})).httpStatusCode,400);assert.equal((await saveSettings({}, {uid:'wrong'})).httpStatusCode,403);
assert.equal(php.readFileAsText('/www/local/gallery-settings.json'),settingsRaw);
assert.equal((await saveSettings({}, {record_version:'old'})).httpStatusCode,409);
assert.ok(!(await req('/mpanel/setting.php?action=setfour')).text.includes('name="set38"'));
pass('one source of gallery settings; bounds, format allowlist, CSRF, stale settings, old panel link');
await run("$im=imagecreatetruecolor(4000,3000);imagefilledrectangle($im,0,0,1999,1499,imagecolorallocate($im,180,70,40));imagefilledrectangle($im,2000,0,3999,1499,imagecolorallocate($im,60,130,80));imagefilledrectangle($im,0,1500,1999,2999,imagecolorallocate($im,80,100,190));imagefilledrectangle($im,2000,1500,3999,2999,imagecolorallocate($im,230,180,80));imagejpeg($im,'/tmp/large.jpg',92);imagedestroy($im);$im=imagecreatetruecolor(32,16);imagepng($im,'/tmp/small.png');imagewebp($im,'/tmp/small.webp');imagegif($im,'/tmp/small.gif');imagedestroy($im);");
const big=Buffer.from(php.readFileAsBuffer('/tmp/large.jpg'));
// Include harmless trailing padding to exercise a multi-megabyte mobile upload.
const large=Buffer.concat([big,Buffer.alloc(3*1048576)]);
await login(0);
let r=await req('/gallery/index.php?action=add',{uid,name:'Большой город 😊',msg:'Фото 4000 × 3000 :hello',ashow:'1',file:upload(large,'Телефон.JPG')});if(r.httpStatusCode!==302)console.log(r.text.slice(-3500));assert.equal(r.httpStatusCode,302);
const id=rows().at(-1).split('|')[6],firstRow=rows().at(-1);assert.match(id,/^[a-f0-9]{32}\.jpg$/);
assert.deepEqual(Buffer.from((await req(full(id))).bytes),large);assert.equal(php.readFileAsText('/www/local/profil/Role0.prof').split(':||:')[72],id);
r=await req(preview(id));assert.equal(r.httpStatusCode,200);assert.equal(r.headers['content-type'][0],'image/jpeg');assert.ok(r.bytes.length<big.length);
php.writeFile('/tmp/preview.jpg',r.bytes);assert.deepEqual(JSON.parse((await run("echo json_encode(array_slice(getimagesize('/tmp/preview.jpg'),0,2));")).text).slice(0,2),[960,720]);
writeFileSync(new URL('preview.jpg',fixtureDir),r.bytes);writeFileSync(new URL('original.jpg',fixtureDir),big);
r=await req(full(id),undefined,{},'HEAD');assert.equal(r.bytes.length,0);assert.equal(Number(r.headers['content-length'][0]),large.length);
assert.ok((await req(full(id)+'&download=1')).headers['content-disposition'][0].startsWith('attachment;'));
assert.equal((await req(full(id))).headers['cache-control'][0],'private, no-store');assert.equal((await req(full(id))).headers['x-content-type-options'][0],'nosniff');
assert.equal((await req(full(id),{uid})).httpStatusCode,405);
pass('real 3+ MB, 4000×3000 upload; original unchanged, 960×720 preview, profile, HEAD/download and no-store');
for(const ext of ['jpeg','png','gif','webp']){
 const bytes=ext==='jpeg'?big:php.readFileAsBuffer('/tmp/small.'+ext);
 r=await req('/gallery/index.php?action=add',{uid,name:'Формат '+ext,msg:':hello 😊',file:upload(bytes,'sample.'+ext)});assert.equal(r.httpStatusCode,302,ext);
 const gid=rows().at(-1).split('|')[6];assert.deepEqual(Buffer.from((await req(full(gid))).bytes),Buffer.from(bytes));assert.equal((await req(preview(gid))).httpStatusCode,200);
}
const allIds=rows().map(x=>x.split('|')[6]);
pass('JPG/JPEG/PNG/GIF/WebP validated, decoded and served without changing original bytes');
const before=catalog();
for(const[name,bytes]of [['attack.php','<?php echo 1;'],['fake.jpg','not an image'],['wrong.jpg',php.readFileAsBuffer('/tmp/small.png')],['empty.png',''],['large.jpg',Buffer.concat([big,Buffer.alloc(21*1048576)])]]){
 r=await req('/gallery/index.php?action=add',{uid,name:'Reject',msg:'test',file:upload(bytes,name)});assert.equal(r.httpStatusCode,400,name);assert.equal(catalog(),before);
}
assert.equal((await req('/gallery/index.php?action=add',{uid:'bad',name:'CSRF',msg:'test',file:upload(big,'x.jpg')})).httpStatusCode,403);
assert.equal((await req('/gallery/index.php?action=add',{uid,'name[0]':'Array',msg:'test',file:upload(big,'x.jpg')})).httpStatusCode,400);
for(const query of ['../config.dat','foo.jpg','file.php','a..b.jpg','%2Fetc%2Fpasswd']){const denied=await req(full(query));assert.ok([302,404].includes(denied.httpStatusCode));if(denied.httpStatusCode===302)assert.ok(denied.headers.location[0].includes('isset=403'));}
for(const url of [full(id)+'&dir=../local','/gallery/fullsize.php?name[]=x']){const denied=await req(url);assert.ok([302,404].includes(denied.httpStatusCode));if(denied.httpStatusCode===302)assert.ok(denied.headers.location[0].includes('isset=403'));}
assert.equal((await req('/gallery/index.php?action=addkomm&gid=orphan.jpg',{uid,msg:'test comment'})).httpStatusCode,404);
assert.equal((await req('/mpanel/gallery.php')).httpStatusCode,403);assert.equal((await req('/mpanel/gallery.php?action=batch',{uid,'photos[0]':id,command:'delete'})).httpStatusCode,403);assert.equal((await req('/mpanel/gallery-settings.php',{uid,max_mb:'32'})).httpStatusCode,403);
await run("$im=imagecreatetruecolor(9000,2);imagepng($im,'/tmp/too-wide.png');imagedestroy($im);$im=imagecreatetruecolor(5000,5000);imagepng($im,'/tmp/too-many-pixels.png');imagedestroy($im);");
for(const name of ['too-wide','too-many-pixels'])assert.equal((await req('/gallery/index.php?action=add',{uid,name:'Limit',msg:'test',file:upload(php.readFileAsBuffer('/tmp/'+name+'.png'),name+'.png')})).httpStatusCode,400);
assert.equal(catalog(),before);pass('malformed/spoofed/oversized uploads, path traversal, arrays, orphans, CSRF and member privilege escalation denied');
r=await req('/gallery/index.php?action=addkomm&gid='+id,{uid,msg:'Комментарий :hello 😊 [b]текст[/b] <script>alert(1)</script>'});assert.equal(r.httpStatusCode,302);
r=await req(comments(id));assert.ok(r.text.includes('motor-smile'));assert.ok(!r.text.includes('<script>alert(1)</script>'));assert.ok(r.text.includes('😊'));
capture(r,comments(id),'member');capture(await req('/gallery/index.php?action=addfoto'),'/gallery/index.php?action=addfoto','member');
await login(null);
// Changed settings immediately control forms, zoom and regenerated previews; old files remain.
assert.equal((await saveSettings({max_mb:1,max_side:1000,max_mp:1,preview_px:480,zoom:0,formats:['png']})).httpStatusCode,200);
assert.ok(!(await req(detail(id))).text.includes('data-gallery-zoom'));
assert.ok((await req('/gallery/index.php?action=addfoto')).text.includes('До 1 МБ, 1000 px'));
assert.ok((await req('/pages/faq.php')).text.includes('до 1 МБ, 1000 px'));
assert.equal((await req('/gallery/index.php?action=add',{uid,name:'Limit',msg:'test',file:upload(big,'x.jpg')})).httpStatusCode,400);
const oldOriginal=await req(full(id));assert.equal(oldOriginal.httpStatusCode,200);assert.equal(hash(oldOriginal.bytes),hash(large));
r=await req(preview(id));assert.equal(r.httpStatusCode,200);php.writeFile('/tmp/preview2.jpg',r.bytes);assert.deepEqual(JSON.parse((await run("echo json_encode(array_slice(getimagesize('/tmp/preview2.jpg'),0,2));")).text).slice(0,2),[480,360]);
const cacheList=await run("echo json_encode(glob('/www/local/datagallery/previews/"+id+".*.jpg')); ");assert.equal(JSON.parse(cacheList.text).length,1);
assert.equal((await saveSettings({max_mb:20,max_side:8000,max_mp:24,preview_px:960,zoom:1,formats:['jpg','jpeg','png','gif','webp']})).httpStatusCode,200);
pass('admin settings synchronize upload form, allowed formats, limits, viewer and cache; existing originals remain readable');
async function batch(ids,command,extra={}){
 const page=await req('/mpanel/gallery.php');const body={uid,record_version:version(page),command,...extra};ids.forEach((id,i)=>body[`photos[${i}]`]=id);return req('/mpanel/gallery.php?action=batch',body);
}
for(const role of [101,102,103,105]){
 await login(role);r=await req('/mpanel/index.php');assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('Управление галереей'));assert.ok((await req('/gallery/index.php')).text.includes('Админ-панель'));
 assert.equal((await req('/mpanel/gallery-settings.php')).httpStatusCode,role<=102?200:403);
 let page=await req('/mpanel/gallery.php?action=edit&gid='+id),old=version(page);
 r=await req('/mpanel/gallery.php?action=addedit',{uid,gid:id,name:'Подпись '+role,msg:'Фото исправлено :hello 😊 <img src=x onerror=alert(1)>',record_version:old});assert.equal(r.httpStatusCode,302);
 const d=rows().find(x=>x.split('|')[6]===id).split('|');assert.equal(d[2],'Role0');assert.equal(d[4],firstRow.split('|')[4]);
 assert.ok((await req(detail(id))).text.includes('Подпись '+role));assert.ok(!(await req(detail(id))).text.includes('<img src=x onerror=alert(1)>'));
 assert.equal((await req('/mpanel/gallery.php?action=addedit',{uid,gid:id,name:'stale',msg:'stale',record_version:old})).httpStatusCode,409);
 assert.equal((await batch([id],'hide')).httpStatusCode,302);assert.equal((await req(full(id))).httpStatusCode,200);
 await req('/input.php?action=exit');assert.equal((await req(full(id))).httpStatusCode,404);assert.equal((await req(preview(id))).httpStatusCode,404);assert.equal((await req(detail(id))).httpStatusCode,404);assert.equal((await req(comments(id))).httpStatusCode,404);assert.ok(!(await req('/gallery/index.php')).text.includes(id));assert.ok(!(await req('/pages/anketa.php?uz=Role0')).text.includes('gid='+id));
 await login(0);assert.equal((await req(full(id))).httpStatusCode,404);assert.equal((await req('/gallery/index.php?action=addkomm&gid='+id,{uid,msg:'hidden'})).httpStatusCode,404);
 await login(role);assert.equal((await batch([id],'restore')).httpStatusCode,302);await req('/input.php?action=exit');assert.equal((await req(full(id))).httpStatusCode,200);
}
pass('all four staff roles edit/hide/restore; admin-only settings; hidden photos inaccessible in lists, profile, comments, original and preview to guests/owner');
await login(null);
const oldVersion=version(await req('/mpanel/gallery.php'));assert.equal((await batch([allIds[1]],'hide')).httpStatusCode,302);
assert.equal((await batch([allIds[2]],'hide',{record_version:oldVersion})).httpStatusCode,409);
assert.equal((await batch([id],'delete')).httpStatusCode,400);assert.ok(motorExists(id));
function motorExists(id){return php.fileExists('/www/local/datagallery/'+id)}
assert.equal((await batch([id],'delete',{uid:'bad',confirm_delete:'1'})).httpStatusCode,403);
const staleComment=version(await req(comments(id)));
assert.equal((await req('/gallery/index.php?action=addkomm&gid='+id,{uid,msg:'New comment'})).httpStatusCode,302);
assert.equal((await req('/gallery/index.php?action=del&gid='+id,{uid,record_version:staleComment,'del[0]':'0'})).httpStatusCode,409);
assert.equal((await req('/gallery/index.php?action=del&gid='+id,{uid,record_version:version(await req(comments(id))),'del[0]':'1'})).httpStatusCode,302);
assert.ok(php.readFileAsText('/www/local/datagallery/'+id+'.dat').includes('Комментарий'));pass('stale bulk/comment edits rejected; delete confirmation and CSRF required; exact comment removed');
for(const theme of Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))))){
 await req('/pages/skin.php',{uid,skins:theme,return:'themes'});r=await req(detail(id));assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('data-theme="'+theme+'"'));assert.ok(r.text.includes('data-gallery-zoom'));capture(r,detail(id),'admin');
}
for(const url of ['/gallery/index.php','/mpanel/gallery.php','/mpanel/gallery-settings.php','/mpanel/gallery.php?action=edit&gid='+id])capture(await req(url),url,'admin');
pass('12 warm themes share responsive gallery and viewer; upload/comment/edit/settings fixtures captured');
// Actual backup and restore of gallery metadata, original, comments, preview and settings.
r=await req('/mpanel/backup.php?action=newbackup',{files:'1','dirarc[0]':'../local/datagallery'});assert.equal(r.httpStatusCode,302);
let z=await run("$p=glob('/www/local/databackup/*.zip');$z=new ZipArchive();$z->open(end($p));$n=[];for($i=0;$i<$z->numFiles;$i++)$n[]=$z->getNameIndex($i);echo json_encode(['name'=>basename(end($p)),'entries'=>$n]);$z->close();");const backup=JSON.parse(z.text);
assert.ok(backup.entries.includes('gallery-settings.json'));assert.ok(backup.entries.includes('datagallery/'+id));assert.ok(backup.entries.includes('datagallery/'+id+'.dat'));assert.ok(backup.entries.some(x=>x.startsWith('datagallery/previews/')));assert.ok(backup.entries.includes('datagallery/gallery-audit.jsonl'));
php.unlink('/www/local/datagallery/'+id);php.unlink('/www/local/gallery-settings.json');
assert.equal((await req('/mpanel/backup.php?action=unzip&filearc='+backup.name+'&uid='+uid)).httpStatusCode,302);assert.equal(hash(php.readFileAsBuffer('/www/local/datagallery/'+id)),hash(large));assert.ok(php.fileExists('/www/local/gallery-settings.json'));assert.equal(rows().find(x=>x.split('|')[6]===allIds[1]).split('|')[3],'hidden');
pass('actual backup/restore preserves originals, previews, comments, hidden state, settings and audit');
assert.equal((await batch([id,allIds[2]],'delete',{confirm_delete:'1'})).httpStatusCode,302);assert.ok(!motorExists(id));assert.ok(!motorExists(allIds[2]));assert.ok(!php.fileExists('/www/local/datagallery/'+id+'.dat'));assert.equal(php.readFileAsText('/www/local/profil/Role0.prof').split(':||:')[72],'');assert.equal((await req(full(id))).httpStatusCode,404);assert.equal((await req(full(allIds[3]))).httpStatusCode,200);
assert.deepEqual(JSON.parse((await run("echo json_encode(glob('/www/local/datagallery/previews/"+id+".*')); ")).text),[]);
pass('bulk deletion removes only selected original/comment/cache files and clears author profile photo');
await req('/input.php?action=exit');config=php.readFileAsText('/www/local/config.dat').split('|');config[118]='1';php.writeFile('/www/local/config.dat',config.join('|'));assert.equal((await req(full(allIds[3]))).httpStatusCode,302);assert.equal((await req(preview(allIds[3]))).httpStatusCode,302);
pass('binary routes obey site closure and authenticated access gates');
writeFileSync(new URL('manifest.json',fixtureDir),JSON.stringify(fixtures,null,2));writeFileSync(new URL('./gallery-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,passed,large_upload_bytes:large.length,large_upload_pixels:[4000,3000]},null,2));console.log('SUCCESS',requests,'requests;',passed.length,'groups');
}finally{php.exit();}
