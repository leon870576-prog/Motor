import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site',dir=new URL('./arcade-fixtures/',import.meta.url);mkdirSync(dir,{recursive:true});
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));let requests=0;const passed=[];const pass=s=>{passed.push(s);console.log('PASS',s)};
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
 copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false'});
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function req(url,body,headers={},method){php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));if(body){body=new TextEncoder().encode(new URLSearchParams(body).toString());headers={...headers,'content-type':'application/x-www-form-urlencoded'};}const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,r.text);return r;}
 const read=p=>php.readFileAsText('/www/local/'+p),write=(p,s)=>php.writeFile('/www/local/'+p,s),profile=()=>read('profil/ArcAdmin.prof').split(':||:');
 const field=(r,n)=>{const m=r.text.match(new RegExp('name="'+n+'" value="([^"]+)"'));assert.ok(m,n);return m[1];};
 const set=(n,value)=>{const p=profile();p[n]=value;write('profil/ArcAdmin.prof',p.join(':||:'));};
 const state=()=>profile()[98].startsWith('arc1:')?JSON.parse(profile()[98].slice(5)):{revision:'0',games:{}};
 const save=(name,text)=>writeFileSync(new URL(name,dir),text);
 async function pure(code){php.chdir('/www');const r=await php.run({code:"<?php define('BASEDIR','/www/');define('DATADIR','/www/local/');require '/www/includes/functions.php';require '/www/includes/arcade.php';require '/www/includes/game21.php';$config=['userprofkey'=>100];"+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0,r.text);return JSON.parse(r.text);}
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'ArcAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
 let cfg=read('config.dat').split('|');for(const n of [3,29,57,63,64,65])cfg[n]='0';cfg[120]='100';write('config.dat',cfg.join('|'));
 for(const id of ['bandit','kosti','naperstki'])assert.equal((await req('/games/'+id+'.php',null,{accept:'application/json'})).httpStatusCode,401);
 assert.equal((await req('/mpanel/arcade-settings.php')).httpStatusCode,403);
 await req('/input.php',{login:'ArcAdmin',pass:password});set(41,'1000000');set(98,'');set(99,'');
 let page=await req('/mpanel/arcade-settings.php'),uid=field(page,'uid'),version=field(page,'version');save('admin.html',page.text);
 const defaults=await pure('echo json_encode(motor_arcade_settings());');assert.equal(php.fileExists('/www/local/arcade-settings.json'),false);let settings=structuredClone(defaults);
 const form=(s,v)=>({uid,version:v,...Object.fromEntries(Object.entries(s).flatMap(([id,values])=>Object.entries(values).map(([k,value])=>[id+'_'+k,String(value)])))});
 async function settingsSave(s){const r=await req('/mpanel/arcade-settings.php',form(s,version));assert.equal(r.httpStatusCode,200,r.text);version=field(r,'version');settings=structuredClone(s);return r;}
 async function play(id,extra={},headers={},raw=false){const r=await req('/games/'+id+'.php',{uid,command:'play',revision:state().revision,rules_revision:version,...(id==='naperstki'?{choice:'2'}:{}),...extra},{accept:'application/json',...headers});if(!raw)assert.equal(r.httpStatusCode,200,r.text);return r;}
 for(const [key,value] of [['21_percent','-1'],['21_percent','101'],['kosti_percent','50.5'],['bandit_mode','fake'],['naperstki_cost','0'],['bandit_cost','100001']])assert.equal((await req('/mpanel/arcade-settings.php',{...form(defaults,version),[key]:value})).httpStatusCode,400);
 assert.equal((await req('/mpanel/arcade-settings.php',{...form(defaults,version),'21_percent[0]':'1'})).httpStatusCode,400);
 assert.equal((await req('/mpanel/arcade-settings.php',{...form(defaults,version),uid:'bad'})).httpStatusCode,403);
 assert.equal((await req('/mpanel/arcade-settings.php',form(defaults,version),{Origin:'https://evil.test'})).httpStatusCode,403);
 const oldVersion=version;settings['21'].mode='percent';settings['21'].percent=35;await settingsSave(settings);const persisted=read('arcade-settings.json');assert.equal((await req('/mpanel/arcade-settings.php',form(defaults,oldVersion))).httpStatusCode,409);assert.equal(read('arcade-settings.json'),persisted);
 await settingsSave(defaults);save('admin.html',(await req('/mpanel/arcade-settings.php')).text);
 assert.ok((await req('/mpanel/index.php')).text.includes('arcade-settings.php'));
 pass('four independent settings, random default without migration, 0–100 integer bounds, cost bounds, CSRF/Origin/array validation, stale save rejected, admin link');
 for(const id of ['bandit','kosti','naperstki']){
  const url='/games/'+id+'.php';page=await req(url);save(id+'-ready.html',page.text);const unchanged=profile().join(':||:');
  for(const extra of [{uid:'bad'},{'revision[0]':'x'},{command:'fake'},{rules_revision:'bad'}]){const r=await play(id,extra,{},true);assert.ok([400,403,409].includes(r.httpStatusCode));}
  assert.equal((await play(id,{}, {Origin:'https://evil.test'},true)).httpStatusCode,403);
  assert.equal((await req(url+'?action=go&uid='+uid)).httpStatusCode,403);
  await req(url,null,{},'HEAD');assert.equal(profile().join(':||:'),unchanged);
  const before=+profile()[41],revision=state().revision;r: {const r=await play(id);save(id+'-result.json',r.text);}
  const result=state().games[id];assert.equal(+profile()[41],before-result.cost+result.payout);assert.equal(result.rounds,1);
  save(id+'-result.html',(await req(url)).text);const after=profile().join(':||:');
  assert.equal((await play(id,{revision},{},true)).httpStatusCode,409);await req(url);assert.equal(profile().join(':||:'),after);
  if(id==='naperstki'){for(const choice of ['0','4','1x','1.2',''])assert.equal((await play(id,{choice},{},true)).httpStatusCode,400);const fresh=await req(url+'?new=1',null,{accept:'application/json'});save(id+'-ready.json',fresh.text);assert.equal(profile().join(':||:'),after);assert.ok(!fresh.text.includes('arcade-ball'));}
 }
 pass('three real game paths: correct balance arithmetic, durable result, POST-only, CSRF/Origin, strict cup choice, duplicate and refresh unchanged, read-only new-cup view');
 const stale=version;settings.kosti.cost=9;await settingsSave(settings);const balance=profile()[41];assert.equal((await play('kosti',{rules_revision:stale},{},true)).httpStatusCode,409);assert.equal(profile()[41],balance);
 set(41,'0');for(const id of ['bandit','kosti','naperstki']){assert.equal((await play(id,{}, {},true)).httpStatusCode,400);save(id+'-empty.html',(await req('/games/'+id+'.php')).text);}set(41,'1000000');
 pass('changed price requires a fresh form; no game with insufficient balance');
 for(const percent of [0,100]){
  for(const id of Object.keys(settings)){settings[id].mode='percent';settings[id].percent=percent;}await settingsSave(settings);
  for(const id of ['bandit','kosti','naperstki'])for(let i=0;i<8;i++){const r=await play(id,{percent:'100',cost:'0',win:'1'});const g=state().games[id];assert.equal(g.status==='won',percent===100);if(i===0&&percent===100){save(id+'-win.html',(await req('/games/'+id+'.php')).text);save(id+'-win.json',r.text);}}
  // Each forced round uses real endpoint actions, not client scores or outcome fields.
  for(const strategy of ['stand','hit']){
   set(99,'');set(41,'1000000');let r=await req('/games/21.php',{uid,command:'start',revision:'0',rules_revision:version,bet:'10',target_win:percent?'0':'1'},{accept:'application/json'});assert.equal(r.httpStatusCode,200,r.text);
   let s=JSON.parse(profile()[99].slice(4));const beforeChange=s.game.policy;
   const other=structuredClone(settings);other['21'].percent=100-percent;await settingsSave(other);
   for(let guard=0;s.game.status==='playing'&&guard<20;guard++){r=await req('/games/21.php',{uid,command:strategy,revision:s.revision,rules_revision:version},{accept:'application/json'});assert.equal(r.httpStatusCode,200,r.text);s=JSON.parse(profile()[99].slice(4));}
   assert.equal(s.game.status,percent===100?'won':'lost');assert.deepEqual(s.game.policy,beforeChange);assert.equal(new Set([...s.game.player,...s.game.dealer,...s.game.deck]).size,36);assert.equal(+profile()[41],1000000-10+(percent?20:0));assert.ok(!r.text.includes('target_win'));assert.ok(!r.text.includes('"deck"'));
   settings['21'].percent=percent;await settingsSave(settings);
  }
 }
 pass('0% and 100% applied by all four engines; 21 stand/hit outcomes agree with cards, no repeats, active policy frozen across admin changes, hidden target/deck never exposed');
 assert.equal(await pure(`$ok=true;foreach([false,true] as $target)for($n=0;$n<150;$n++){$deck=motor21_deck();$s=['rounds'=>0,'wins'=>0,'game'=>['bet'=>10,'status'=>'playing','player'=>[array_pop($deck),array_pop($deck)],'dealer'=>[array_pop($deck),array_pop($deck)],'deck'=>$deck,'target_win'=>$target]];motor21_auto($s);for($i=0;$i<20&&$s['game']['status']==='playing';$i++)motor21_hit($s);$g=$s['game'];$ok=$ok&&($g['status']==='won')===$target&&count(array_unique(array_merge($g['player'],$g['dealer'],$g['deck'])))===36;}echo json_encode($ok);`),true);
 assert.equal(await pure(`$ok=true;for($symbol=1;$symbol<=8;$symbol++){$grid=array_fill(0,9,$symbol);$r=motor_arcade_slot_score($grid,5);$sum=0;foreach(motor_arcade_slot_lines() as $line)$sum+=$line[2][$symbol-1];$ok=$ok&&$r['payout']===$sum&&count($r['lines'])===8;}$r=motor_arcade_slot_score([1,2,3,4,5,6,7,8,1],5);echo json_encode($ok&&$r['payout']===0);`),true);
 assert.deepEqual(await pure(`$counts=[0,0,0];for($a=1;$a<=6;$a++)for($b=1;$b<=6;$b++)for($c=1;$c<=6;$c++)for($d=1;$d<=6;$d++){$cmp=($a+$b)<=>($c+$d);$counts[$cmp+1]++;}echo json_encode($counts);`),[575,146,575]);
 pass('300 complete controlled 21 hands; all eight slot symbols across eight lines with exact payouts; exhaustive 1296 fair-dice outcomes: 575 losses / 146 ties / 575 wins');
 const oldArc=profile()[98],old21=profile()[99];await pure('increment_profil("ArcAdmin",[12=>1,41=>1]);change_profil("ArcAdmin",[29=>"Игрок"]);echo "true";');assert.equal(profile()[98],oldArc);assert.equal(profile()[99],old21);
 set(98,'unrecognized');assert.equal((await req('/games/bandit.php')).httpStatusCode,503);assert.equal(profile()[98],'unrecognized');set(98,oldArc);
 const beforeBackup=read('arcade-settings.json');const br=await req('/mpanel/backup.php?action=newbackup',{uid,files:'1'});assert.ok([200,302].includes(br.httpStatusCode));assert.equal(read('arcade-settings.json'),beforeBackup);assert.equal(await pure('$ok=false;foreach(glob(DATADIR."databackup/*.zip") as $path){$z=new ZipArchive();if($z->open($path)===true){for($i=0;$i<$z->numFiles;$i++)if(basename($z->getNameIndex($i))==="arcade-settings.json")$ok=$z->getFromIndex($i)===file_get_contents(DATADIR."arcade-settings.json");$z->close();}}echo json_encode($ok);'),true);
 // Role isolation and ordinary no-JavaScript form submission.
 await settingsSave(defaults);const r=await req('/games/kosti.php',{uid,command:'play',revision:state().revision,rules_revision:version});assert.equal(r.httpStatusCode,303);
 const member=profile();member[0]='ArcMember';member[7]='0';member[98]='';member[99]='';write('profil/ArcMember.prof',member.join(':||:'));await req('/input.php?action=exit',{uid});await req('/input.php',{login:'ArcMember',pass:password});page=await req('/games/bandit.php');assert.ok(page.text.includes('data-revision="0"'));const memberUid=field(page,'uid');assert.equal((await req('/mpanel/arcade-settings.php')).httpStatusCode,403);assert.equal((await req('/mpanel/arcade-settings.php',{...form(defaults,version),uid:memberUid})).httpStatusCode,403);assert.ok(!page.text.includes('Настройки игр и вероятности'));
 pass('profile updates preserve both game fields, unknown stored data fails closed, backup path works, no-JavaScript POST/303, other account isolated and admin settings forbidden');
 writeFileSync(new URL('./arcade-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2)+'\n');console.log('SUCCESS',requests,'arcade HTTP checks');
}finally{php.exit();}
