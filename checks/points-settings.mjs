import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));

const fixtures=[],passed=[];let requests=0,uid='',logged=false;
const pass=s=>{passed.push(s);console.log('PASS',s)},id=()=>randomBytes(16).toString('hex');
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false',memory_limit:'256M'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
 if(body&&typeof body==='object'){
  const boundary='UP'+id(),parts=[];
  for(const[k,v]of Object.entries(body)){if(v&&typeof v==='object'&&v.bytes){parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"; filename="'+v.filename+'"\r\nContent-Type: image/gif\r\n\r\n'),v.bytes,Buffer.from('\r\n'));}else parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+String(v)+'\r\n'));}
  parts.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(parts));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
 }
 const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,url);return r;
}
async function run(code){const r=await php.run({code:'<?php '+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0);return r.text;}
const password=randomBytes(10).toString('hex');
await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'PageAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
cfg[121]='10';cfg[122]='1000';cfg[123]='10';cfg[89]='1';cfg[133]='128';cfg[134]='100000';cfg[119]='5';php.writeFile('/www/local/config.dat',cfg.join('|'));
const template=php.readFileAsText('/www/local/profil/PageAdmin.prof').split(':||:');
for(const[name,role]of [['PageOwner',0],['PageGuest',0],['PageOther',0],['PageMod',103],['PagePhoto',105],['PageCoAdmin',102]]){
 const p=[...template];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';p[49]='17';p[50]='21';p[51]='4';p[4]='private-'+name+'@example.test';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));
}
async function token(){const r=await req('/pages/themes.php');const m=r.text.match(/name="uid" value="([^"]+)"/);assert.ok(m);return m[1];}
async function logout(){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();}
async function login(name){await logout();const r=await req('/input.php',{login:name,pass:password});assert.equal(r.httpStatusCode,302);logged=true;uid=await token();}
const profile=name=>php.readFileAsText('/www/local/profil/'+name+'.prof').split(':||:');
function set(name,fields){const p=profile(name);for(const[k,v]of Object.entries(fields))p[+k]=String(v);php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
const admin='/mpanel/points-settings.php',field=(r,n)=>r.text.match(new RegExp('name="'+n+'"[^>]*value="([^"]*)"'))?.[1];
const helpers="define('BASEDIR','/www/');define('DATADIR','/www/local/');require '/www/includes/functions.php';require '/www/includes/wallet.php';$config=['includenick'=>1,'userprofkey'=>100,'avatarpoints'=>321,'karantin'=>0,'regkeys'=>0,'minkredit'=>10,'maxkredit'=>1000,'percentkredit'=>10];";
const pure=async c=>JSON.parse(await run(helpers+c));
const defaults=await pure('echo json_encode(motor_points_settings());');assert.equal(defaults.avatar_upload,321);assert.equal(defaults.reputation,150);assert.equal(php.fileExists('/www/local/points-settings.json'),false);
assert.equal((await req(admin)).httpStatusCode,403);
for(const name of ['PageOwner','PageCoAdmin','PageMod']){await login(name);assert.equal((await req(admin)).httpStatusCode,403);assert.equal((await req(admin,{uid,...defaults,version:'0'.repeat(64)})).httpStatusCode,403);}
await login('PageAdmin');let r=await req(admin),version=field(r,'version');assert.ok(version);assert.equal((r.text.match(/type="number"/g)||[]).length,10);assert.ok((await req('/mpanel/index.php')).text.includes('points-settings.php'));
assert.equal((await req(admin,{...defaults,version,uid:'bad'})).httpStatusCode,403);assert.equal((await req(admin,{...defaults,version,uid},{Origin:'https://evil.test'})).httpStatusCode,403);
for(const [key,v]of [['reputation','-1'],['transfer','2.5'],['credit','1000001'],['nickname','1e2'],['email','<script>'],['flood_half','20']])assert.equal((await req(admin,{...defaults,version,uid,[key]:v})).httpStatusCode,400);
assert.equal((await req(admin,{...defaults,version,uid,'credit[]':'1'})).httpStatusCode,400);
let settings={...defaults,reputation:7,transfer:8,credit:9,email:10,nickname:11,avatar_upload:12,flood_newbie:10,flood_half:20,flood_third:30,flood_sixth:40};
async function save(s){const r=await req(admin,{...s,uid,version});assert.equal(r.httpStatusCode,200,r.text.match(/role="alert">([^<]+)/)?.[1]);version=field(r,'version');return r;}
const oldVersion=version;await save(settings);assert.equal((await req(admin,{...defaults,uid,version:oldVersion})).httpStatusCode,409);assert.deepEqual(await pure('echo json_encode(motor_points_settings());'),settings);
const settingsRaw=php.readFileAsText('/www/local/points-settings.json');assert.equal((await req(admin,undefined,{},'HEAD')).httpStatusCode,200);assert.equal(php.readFileAsText('/www/local/points-settings.json'),settingsRaw);
const dir=new URL('./points-fixtures/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('admin.html',dir),(await req(admin)).text);
pass('ten settings: defaults, main-admin-only access, CSRF/Origin/type/range/order validation, stale save and read-only GET/HEAD');
set('PageOwner',{36:6,41:1000,48:0,49:0,50:0,51:0,96:'',65:'МойНик',75:0});set('PageOther',{36:0,41:100,49:0,50:0,51:0,96:''});
await login('PageOwner');r=await req('/pages/userpage.php?uz=PageOther');assert.ok(r.text.includes('от 7 баллов'));assert.equal((await req('/pages/raiting.php?uz=PageOther',{uid,vote:'plus'})).httpStatusCode,403);set('PageOwner',{36:7});assert.equal((await req('/pages/raiting.php?uz=PageOther',{uid,vote:'plus'})).httpStatusCode,303);assert.equal(profile('PageOther')[49],'1');
const transfer='/games/perevod.php';r=await req(transfer);assert.match(r.text,/не менее 8 баллов/);let revision=field(r,'revision');const send=(extra={},headers={})=>req(transfer+'?action=go',{uid,uz:'PageOther',gold:'25',revision,...extra},headers);
assert.equal((await send()).httpStatusCode,403);set('PageOwner',{36:8});
const before=profile('PageOwner')[41];for(const gold of ['-1','0','1.1','1e2','01','1000000001','abc'])assert.equal((await send({gold})).httpStatusCode,400);
assert.equal((await send({uz:'../outside'})).httpStatusCode,400);assert.equal((await send({uz:'PageOwner'})).httpStatusCode,403);assert.equal((await send({uz:'Missing'})).httpStatusCode,404);assert.equal((await send({uid:'bad'})).httpStatusCode,403);assert.equal((await send({}, {Origin:'https://evil.test'})).httpStatusCode,403);assert.equal((await req(transfer+'?action=go&uid='+uid)).httpStatusCode,403);
assert.equal(profile('PageOwner')[41],before);r=await send();assert.equal(r.httpStatusCode,200,r.text.match(/role="alert">([^<]+)/)?.[1]);assert.equal(profile('PageOwner')[41],'975');assert.equal(profile('PageOther')[41],'125');const unread=profile('PageOther')[10];
assert.equal((await send()).httpStatusCode,200);assert.equal(profile('PageOwner')[41],'975');assert.equal(profile('PageOther')[10],unread);assert.equal((await send({gold:26})).httpStatusCode,409);
revision=field(await req(transfer),'revision');assert.equal((await send({gold:976})).httpStatusCode,409);r=await send({gold:20});assert.equal(r.httpStatusCode,200);assert.equal(profile('PageOther')[41],'145');writeFileSync(new URL('transfer.html',dir),r.text);
pass('reputation and transfer thresholds at exact boundary; newbie recipient, strict amounts, self/invalid/missing users, CSRF, replay and overdraft guards');
// The receipt repairs both interruption windows without debiting twice.
const snapshotA=profile('PageOwner'),snapshotB=profile('PageOther');let s=JSON.parse(snapshotA[96].slice(8));s.last.pending=true;set('PageOwner',{96:'wallet1:'+JSON.stringify(s)});assert.equal((await send({gold:20})).httpStatusCode,200);assert.equal(profile('PageOther')[41],'145');
let t=JSON.parse(snapshotB[96].slice(8));const identity=Object.keys(t.incoming)[0];t.incoming[identity]-=20;set('PageOther',{41:125,96:'wallet1:'+JSON.stringify(t)});set('PageOwner',{96:'wallet1:'+JSON.stringify(s)});assert.equal((await send({gold:20})).httpStatusCode,200);assert.equal(profile('PageOther')[41],'145');assert.equal(profile('PageOwner')[41],'955');
// Pending transfer must finish before opening a new operation.
set('PageOwner',{96:'wallet1:'+JSON.stringify(s)});assert.equal((await send({gold:5,revision:s.revision})).httpStatusCode,409);await send({gold:20});
const credit='/games/kredit.php';r=await req(credit);let cv=field(r,'revision'),rules=field(r,'rules');const loan=(extra={})=>req(credit+'?action=operacia',{uid,gold:'100',oper:'1',revision:cv,rules,...extra});
set('PageOwner',{36:8,53:0,54:0});assert.equal((await loan()).httpStatusCode,403);set('PageOwner',{36:9});r=await loan();assert.equal(r.httpStatusCode,200,r.text.match(/role="alert">([^<]+)/)?.[1]);assert.ok(Number(profile('PageOwner')[54])>=100);
assert.equal((await loan()).httpStatusCode,200);assert.equal(profile('PageOwner')[41],'1055');
set('PageOwner',{36:0});r=await req(credit);cv=field(r,'revision');const debt=profile('PageOwner')[54];assert.equal((await loan({oper:'2',gold:debt})).httpStatusCode,200);assert.equal(profile('PageOwner')[54],'0');
set('PageOwner',{36:100,41:1000,53:1,54:100});const unchanged=profile('PageOwner');r=await req(credit);for(const f of [36,41,49,51,53,54,96])assert.equal(profile('PageOwner')[f],unchanged[f]);assert.match(r.text,/101/);cv=field(r,'revision');assert.equal((await loan({oper:'2',gold:101})).httpStatusCode,200);assert.equal(profile('PageOwner')[41],'899');assert.equal(profile('PageOwner')[36],'90');assert.equal((await loan({oper:'2',gold:101})).httpStatusCode,200);assert.equal(profile('PageOwner')[36],'90');writeFileSync(new URL('credit.html',dir),(await req(credit)).text);
pass('transfer receipts recover both interrupted windows, pending operations block new ones; credit boundary/replay/repayment and read-only overdue GET');
// Remaining surfaces and read helpers use the same rules.
set('PageOwner',{36:10,65:'МойНик'});r=await req('/pages/account.php');assert.match(r.text,/не менее 11 баллов/);assert.ok(!r.text.includes('name="nickname"'));assert.ok(r.text.includes('action=editmail'));
assert.equal(await pure("echo json_encode(nickname('PageOwner'));"),'PageOwner');set('PageOwner',{36:11});assert.equal(await pure("echo json_encode(nickname('PageOwner'));"),'МойНик');assert.ok((await req('/pages/account.php')).text.includes('name="nickname"'));
r=await req('/pages/avators.php?action=load');assert.ok(r.text.includes('12'));r=await req('/pages/faq.php');for(const n of [7,8,9,10,11,12])assert.ok(r.text.includes(n+'</b> баллов'),String(n));
const periods=await pure("$_SESSION=['log'=>'','par'=>''];$udata=array_fill(0,100,'0');$udata[7]='0';$config['floodstime']=60;$a=[];foreach([0,9,10,19,20,29,30,39,40] as $points){$udata[36]=$points;$a[]=flood_period();}echo json_encode($a);");assert.deepEqual(periods,[120,120,60,60,30,30,20,20,10]);
// Exercise the handlers, not only their hints.
set('PageOwner',{36:9});const oldMail=profile('PageOwner')[4];await req('/pages/account.php?action=editmail',{uid,meil:'changed@example.test',provpass:password});assert.equal(profile('PageOwner')[4],oldMail);set('PageOwner',{36:10});assert.equal((await req('/pages/account.php?action=editmail',{uid,meil:'changed@example.test',provpass:password})).httpStatusCode,302);assert.equal(profile('PageOwner')[4],'changed@example.test');
const oldNick=profile('PageOwner')[65];await req('/pages/nickname.php',{uid,nickname:'НовоеИмя'});assert.equal(profile('PageOwner')[65],oldNick);set('PageOwner',{36:11,75:0});assert.equal((await req('/pages/nickname.php',{uid,nickname:'НовоеИмя'})).httpStatusCode,302);assert.equal(profile('PageOwner')[65],'НовоеИмя');
const avatar={filename:'portrait.gif',bytes:readFileSync(join(root,'images/avators/1.gif'))};set('PageOwner',{41:100000});let avatarBalance=profile('PageOwner')[41];await req('/pages/avators.php?action=addload',{uid,file:avatar});assert.equal(profile('PageOwner')[41],avatarBalance);set('PageOwner',{36:12});r=await req('/pages/avators.php?action=addload',{uid,file:avatar});assert.ok(r.text.includes('Аватар успешно загружен'));assert.equal(profile('PageOwner')[43],'gallery/avators.php?uz=PageOwner');assert.ok(Number(profile('PageOwner')[41])<Number(avatarBalance));avatarBalance=profile('PageOwner')[41];await req('/pages/avators.php?action=addload',{uid,file:avatar});assert.equal(profile('PageOwner')[41],avatarBalance);
pass('email, nickname and valid GIF upload handlers enforce exact custom boundaries; identical upload is not charged twice');
await login('PageAdmin');r=await req('/mpanel/setting.php?action=seteleven');assert.ok(!r.text.includes('name="set132"'));assert.ok(r.text.includes('points-settings.php'));
const backup=await req('/mpanel/backup.php?action=newbackup',{uid,files:'1'});assert.ok([200,302].includes(backup.httpStatusCode));assert.equal(await pure('$ok=false;foreach(glob(DATADIR."databackup/*.zip") as $path){$z=new ZipArchive();if($z->open($path)===true){for($i=0;$i<$z->numFiles;$i++)if(basename($z->getNameIndex($i))==="points-settings.json")$ok=$z->getFromIndex($i)===file_get_contents(DATADIR."points-settings.json");$z->close();}}echo json_encode($ok);'),true);
settings={...settings,reputation:0,transfer:0,credit:0,email:0,nickname:0,avatar_upload:0};await save(settings);assert.equal(await pure("echo json_encode(motor_points_min('transfer'));"),0);
pass('email/nickname/avatar/FAQ and all four antiflood tiers synchronized; old price form cannot reset avatar threshold; settings included in ZIP backup; zero thresholds accepted');
const saved=php.readFileAsText('/www/local/points-settings.json');php.writeFile('/www/local/points-settings.json','broken');assert.equal(await run(helpers+"try{motor_points_settings();}catch(Throwable $e){echo $e->getCode();}"),'503');php.writeFile('/www/local/points-settings.json',saved);
await run("rename('/www/local/points-settings.json','/tmp/points-settings');file_put_contents('/tmp/outside','untouched');symlink('/tmp/outside','/www/local/points-settings.json');");assert.equal(await run(helpers+"try{motor_points_settings();}catch(Throwable $e){echo $e->getCode();}"),'503');assert.equal(php.readFileAsText('/tmp/outside'),'untouched');await run("unlink('/www/local/points-settings.json');rename('/tmp/points-settings','/www/local/points-settings.json');");
set('PageOwner',{36:0,41:1000000001,53:2000000100,54:1000000001});assert.equal(await pure("$p=reading_profil('PageOwner');$s=motor_wallet_state($p);motor_wallet_credit('PageOwner','2','1000000001',$s['revision'],motor_wallet_credit_rules(),2000000000,$p[1]);echo json_encode(reading_profil('PageOwner')[41]);"),'0');assert.equal(profile('PageOwner')[54],'0');
set('PageOwner',{36:200,41:100,37:1,38:2000000100});const credential=profile('PageOwner')[1];const walletAttempt=h=>helpers+"try{motor_wallet_transfer('PageOwner','PageOther','1',motor_wallet_state(reading_profil('PageOwner'))['revision'],2000000000,'"+h+"');}catch(Throwable $e){echo $e->getCode();}";assert.equal(await run(walletAttempt(credential)),'403');set('PageOwner',{37:0});assert.equal(await run(walletAttempt('invalid-credential')),'403');assert.equal(profile('PageOwner')[41],'100');
pass('large existing debt remains repayable; wallet rechecks current ban and credential under the profile lock');
set('PageOwner',{96:'foreign-state'});assert.equal(await run(helpers+"try{motor_wallet_transfer('PageOwner','PageOther',1,0,2000000000,'"+profile('PageOwner')[1]+"');}catch(Throwable $e){echo $e->getCode();}"),'503');
pass('corrupt/symlink settings and unknown wallet state fail closed without modifying external files');
writeFileSync(new URL('./points-settings-results.json',import.meta.url),JSON.stringify({php:'8.4 WASM',requests,passed,concurrency:'mandatory native Docker gate'},null,2)+'\n');console.log('SUCCESS',requests,'HTTP requests');
}finally{php.exit()}
