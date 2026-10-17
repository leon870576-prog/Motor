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
let requests=0,passed=[];
const pass=x=>{passed.push(x);console.log('PASS',x)};
try{
copy(root,'/www');
await setPhpIniEntries(php,{upload_max_filesize:'32M',post_max_size:'64M',max_file_uploads:'20',allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 if(url==='/input.php?action=exit' && !body){const form=await req('/pages/themes.php');const token=form.text.match(/name="uid" value="([^"]+)"/);assert.ok(token,'logout form token');body={uid:token[1]};}
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
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
 requests++;assert.equal(r.errors,'',url);assert.ok(r.exitCode===0,url+' exit '+r.exitCode);return r;
}
function lines(path){return php.readFileAsText('/www/local/'+path).split(/\r?\n/).filter(Boolean)}
function manifest(section,parent){return JSON.parse(php.readFileAsText('/www/local/attachments/'+section+'/'+parent+'/manifest.json'))}
function url(section,parent,id){return '/attachment.php?section='+section+'&parent='+parent+'&file='+id}
async function token(){const r=await req('/pages/themes.php');return r.text.match(/name="uid" value="([^"]+)"/)[1]}
const password=randomBytes(10).toString('hex');
await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'BoardAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let config=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57])config[i]='0';php.writeFile('/www/local/config.dat',config.join('|'));
const template=php.readFileAsText('/www/local/profil/BoardAdmin.prof').split(':||:');
for(const [name,role] of [['BoardMember',0],['OtherMember',0],['Staff102',102],['Staff103',103],['Staff105',105]]){const p=[...template];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
assert.equal((await req('/mpanel/board-settings.php')).httpStatusCode,403);assert.equal((await req('/mpanel/board.php')).httpStatusCode,403);
let uid;async function login(name){await req('/input.php?action=exit');await req('/input.php',{login:name,pass:password});uid=await token();}
await login('BoardAdmin');
const version=r=>{assert.equal(r.httpStatusCode,200);return r.text.match(/name="record_version" value="([a-f0-9]+)"/)[1]};
const settings={count:'5',photo_mb:'8',image_px:'8000',preview_px:'640','formats[0]':'jpg','formats[1]':'jpeg','formats[2]':'png','formats[3]':'gif','formats[4]':'webp'};
async function changeSettings(changes={},extra={}){return req('/mpanel/board-settings.php',{...settings,...changes,uid,record_version:version(await req('/mpanel/board-settings.php')),...extra});}
assert.equal((await changeSettings()).httpStatusCode,200);const settingsBefore=php.readFileAsText('/www/local/board-settings.json');
for(const changes of [{count:'6'},{count:'-1'},{'formats[0]':'php'},{photo_mb:'33'},{image_px:'12001'},{preview_px:'99999'},{'count[0]':'5'}]){assert.equal((await changeSettings(changes)).httpStatusCode,400,JSON.stringify(changes));assert.equal(php.readFileAsText('/www/local/board-settings.json'),settingsBefore);}
assert.equal((await changeSettings({}, {uid:'wrong'})).httpStatusCode,403);assert.equal((await changeSettings({}, {record_version:'old'})).httpStatusCode,409);
pass('admin settings: count 0–5, size/resolution/format bounds, CSRF and stale versions');
assert.equal((await req('/mpanel/board.php?action=addrub',{uid,zag:'Тестовая рубрика',msg:'Объявления для проверки'})).httpStatusCode,302);
let cat=lines('databoard/database.dat').at(-1).split('|')[2];const boardPath='databoard/'+cat+'.dat';
assert.equal((await req('/mpanel/board.php?action=move&id='+cat+'&uid='+uid)).httpStatusCode,403);
const gif=readFileSync(join(root,'images/img/news.gif'));const upload=(bytes,name)=>new File([bytes],name);
const form=(n=5)=>{const b={uid,zag:'Проверка пяти фотографий',msg:'Объявление с фотографиями :hello 😊 [b]текст[/b]',days:'3'};for(let i=0;i<n;i++)b[`attachments[${i}]`]=upload(gif,'фото-'+i+'.gif');return b;};
const addURL='/board/add.php?action=add&id='+cat;
await login('BoardMember');
let r=await req(addURL,form());assert.equal(r.httpStatusCode,302,r.text.slice(-1500));
let ad=lines(boardPath).at(-1).split('|'),bid=ad[5],parent=ad[7],m=manifest('board',parent);
assert.equal(m.files.length,5);assert.deepEqual(m.context,{category:+cat,bid:+bid});
const view='/board/index.php?action=view&id='+cat+'&bid='+bid,edit='/board/edit.php?id='+cat+'&bid='+bid;
r=await req(view);assert.equal((r.text.match(/<figure class="attachment">/g)||[]).length,5);assert.ok(r.text.includes('<b>текст</b>'));assert.ok(r.text.includes('preview=1'));
r=await req('/board/index.php?action=board&id='+cat);assert.equal((r.text.match(/<figure class="attachment">/g)||[]).length,1);
const media=url('board',parent,m.files[0].id);assert.deepEqual(Buffer.from((await req(media)).bytes),gif);
r=await req(media+'&preview=1');assert.equal(r.httpStatusCode,200);assert.equal(r.headers['content-type'][0],'image/jpeg');assert.equal(r.bytes[0],255);assert.equal(r.bytes[1],216);
assert.equal((await req(media,undefined,{Range:'bytes=0-9'})).httpStatusCode,206);
const originalRow=lines(boardPath).at(-1);const originalFiles=php.listFiles('/www/local/attachments/board/'+parent).sort();
assert.equal((await req(addURL,form(6))).httpStatusCode,400);assert.equal(lines(boardPath).length,1);
for(const [name,bytes] of [['bad.php',gif],['fake.jpg','<?php echo 123;'],['text.txt','text'],['broken.gif',gif.subarray(0,20)]]){let b=form(0);b['attachments[0]']=upload(bytes,name);assert.equal((await req(addURL,b)).httpStatusCode,400,name);assert.equal(lines(boardPath).length,1);}
for(const extra of [{uid:'bad'},{'zag[0]':'x',zag:undefined},{days:'9999'},{days:'0'},{'days[0]':'2',days:undefined}]){let b={...form(0),...extra};for(const k in b)if(b[k]===undefined)delete b[k];assert.ok([400,403].includes((await req(addURL,b)).httpStatusCode));assert.equal(lines(boardPath).length,1);}
pass('five photos, first-photo listing, JPEG preview/original/Range; sixth photo, spoofing, corruption and malformed fields rejected');
await login('OtherMember');assert.equal((await req(edit)).httpStatusCode,403);assert.equal((await req(edit,{...form(0),record_version:hash(originalRow)})).httpStatusCode,403);assert.equal((await req('/mpanel/board-settings.php')).httpStatusCode,403);assert.equal((await req('/mpanel/board.php')).httpStatusCode,403);
assert.equal(lines(boardPath).at(-1),originalRow);
await login('BoardMember');r=await req(edit);let v=version(r);
let b={...form(1),record_version:v,'remove_attachments[0]':m.files[0].id};b['attachments[0]']=upload(gif,'замена.gif');assert.equal((await req(edit,b)).httpStatusCode,302);
assert.equal((await req(media)).httpStatusCode,404);assert.ok(!php.fileExists('/www/local/attachments/board/'+parent+'/'+m.files[0].id+'.640.preview.jpg'));m=manifest('board',parent);assert.equal(m.files.length,5);assert.equal(m.files.at(-1).name,'замена.gif');
// The text need not change when only photos change: version must cover the manifest too.
r=await req(edit,{...form(0),record_version:v,'remove_attachments[0]':m.files[1].id});assert.equal(r.httpStatusCode,409,'stale photo-only edit');
pass('owner/staff authorization, replacement and thumbnail cleanup, stale photo-only edit blocked');
for(const name of ['Staff102','Staff103','Staff105']){await login(name);assert.equal((await req(edit)).httpStatusCode,200);assert.equal((await req('/mpanel/board.php?action=board&id='+cat)).httpStatusCode,200);assert.equal((await req('/mpanel/board-settings.php')).httpStatusCode,name==='Staff102'?200:403);}
await login('BoardAdmin');assert.equal((await changeSettings({count:'0'})).httpStatusCode,200);await login('BoardMember');r=await req(edit);v=version(r);assert.ok(r.text.includes('Добавление новых вложений отключено'));assert.equal((await req(edit,{...form(0),record_version:v})).httpStatusCode,302);assert.equal(manifest('board',parent).files.length,5);assert.equal((await req(edit,{...form(1),record_version:version(await req(edit))})).httpStatusCode,400);
pass('all moderator roles; disabling new uploads retains old photos and allows text edits');
// Preserve old ads and blank physical lines when editing.
const legacy=['Старое объявление','BoardMember','Текст старого объявления',Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)+86400,99,cat,''].join('|');php.writeFile('/www/local/'+boardPath,php.readFileAsText('/www/local/'+boardPath)+'\r\n'+legacy+'\r\n');
let oldEdit='/board/edit.php?id='+cat+'&bid=99';assert.equal((await req(oldEdit,{...form(0),record_version:version(await req(oldEdit)),zag:'Обновлённое старое объявление'})).httpStatusCode,302);assert.equal(lines(boardPath).length,2);assert.equal(lines(boardPath).at(-1).split('|')[5],'99');
pass('legacy records and blank-line indexes survive editing without data migration');
// Save browser fixtures before deletion, using actual rendered PHP pages.
const fixtureDir=new URL('./board-fixtures/',import.meta.url);mkdirSync(fixtureDir,{recursive:true});const fixtures=[];
await login('BoardAdmin');await changeSettings();
for(const u of [view,edit,'/board/add.php?id='+cat,'/mpanel/board-settings.php','/mpanel/board.php?action=board&id='+cat,'/mpanel/board.php']){const page=await req(u);assert.equal(page.httpStatusCode,200);let file=fixtures.length+'.html';writeFileSync(new URL(file,fixtureDir),page.text);fixtures.push({file,url:u});}
writeFileSync(new URL('manifest.json',fixtureDir),JSON.stringify(fixtures));writeFileSync(new URL('photo.gif',fixtureDir),gif);
// Stale lists cannot delete another ad after reorder/insertion.
const moderation='/mpanel/board.php?action=board&id='+cat;let listVersion=version(await req(moderation));assert.equal((await req(addURL,form(0))).httpStatusCode,302);
assert.equal((await req('/mpanel/board.php?action=deltop&id='+cat,{uid,record_version:listVersion,'del[0]':bid})).httpStatusCode,409);
assert.equal((await req('/mpanel/board.php?action=deltop&id='+cat,{uid,record_version:version(await req(moderation)),'del[0]':bid})).httpStatusCode,302);assert.ok(!php.fileExists('/www/local/attachments/board/'+parent));
// Expired original and preview are immediately unavailable, then pruning removes binaries.
assert.equal((await req(addURL,form(1))).httpStatusCode,302);ad=lines(boardPath).at(-1).split('|');m=manifest('board',ad[7]);const expiredURL=url('board',ad[7],m.files[0].id);ad[4]='1';let rows=lines(boardPath);rows[rows.length-1]=ad.join('|');php.writeFile('/www/local/'+boardPath,rows.join('\r\n')+'\r\n');
assert.equal((await req(expiredURL)).httpStatusCode,404);assert.equal((await req(expiredURL+'&preview=1')).httpStatusCode,404);await req('/board/index.php?action=board&id='+cat);assert.ok(!php.fileExists('/www/local/attachments/board/'+ad[7]));
pass('stable IDs and stale-list protection; deleted/expired ads deny originals and thumbnails and remove files');
assert.equal((await req(addURL,form(2))).httpStatusCode,302);ad=lines(boardPath).at(-1).split('|');
assert.equal((await req('/mpanel/board.php?action=delrub',{uid,record_version:version(await req('/mpanel/board.php')),'del[0]':cat})).httpStatusCode,302);assert.ok(!php.fileExists('/www/local/'+boardPath));assert.ok(!php.fileExists('/www/local/attachments/board/'+ad[7]));
assert.equal((await req(addURL,form(0))).httpStatusCode,404);
pass('category deletion removes advertisements and photos; additions to deleted category blocked');
writeFileSync(new URL('./board-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,passed,fixtures:fixtures.length},null,2));console.log('SUCCESS',requests,'HTTP requests,',passed.length,'functional groups');
}finally{php.exit()}
