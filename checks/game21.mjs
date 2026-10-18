import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site',dir=new URL('./game21-fixtures/',import.meta.url);
mkdirSync(dir,{recursive:true});const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
let requests=0;const passed=[];const pass=s=>{passed.push(s);console.log('PASS',s)};
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try {
 copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false'});
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function req(url,body,headers={},method){php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));if(body){body=new TextEncoder().encode(new URLSearchParams(body).toString());headers={...headers,'content-type':'application/x-www-form-urlencoded'};}const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,r.text);return r;}
 const read=p=>php.readFileAsText('/www/local/'+p),write=(p,s)=>php.writeFile('/www/local/'+p,s),profile=()=>read('profil/CardAdmin.prof').split(':||:');
 const setProfile=(index,value)=>{const d=profile();d[index]=value;write('profil/CardAdmin.prof',d.join(':||:'));};
 const state=()=>JSON.parse(profile()[99].slice(4));
 const save=(name,text)=>writeFileSync(new URL(name,dir),text);
 async function pure(code){php.chdir('/www');const r=await php.run({code:"<?php define('BASEDIR','/www/');define('DATADIR','/www/local/');require '/www/includes/functions.php';require '/www/includes/game21.php';$config=['userprofkey'=>100];"+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0,r.text);return JSON.parse(r.text);}
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'CardAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
 let cfg=read('config.dat').split('|');for(const n of [3,29,57,63,64,65])cfg[n]='0';cfg[120]='100';write('config.dat',cfg.join('|'));
 let r=await req('/games/21.php',null,{accept:'application/json'});assert.equal(r.httpStatusCode,401);
 await req('/input.php',{login:'CardAdmin',pass:password});setProfile(41,'1000');setProfile(99,'');
 r=await req('/games/21.php');assert.equal(r.httpStatusCode,200);save('ready.html',r.text);
 const uid=r.text.match(/name="uid" value="([^"]+)"/)[1], rulesRevision=r.text.match(/name="rules_revision" value="([^"]+)"/)[1];
 async function act(command,revision,bet,headers={}){return req('/games/21.php',{uid,command,revision,rules_revision:rulesRevision,...(bet!==undefined?{bet}:{} )},{accept:'application/json',...headers});}
 const initial=profile()[41];
 for(const body of [{command:'start',revision:'0',bet:'10'},{uid:'bad',command:'start',revision:'0',bet:'10'},{uid,command:'start',revision:'0','bet[0]':'10'}]){r=await req('/games/21.php',body);assert.ok([400,403].includes(r.httpStatusCode));}
 for(const headers of [{Origin:'https://attacker.test'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await act('start','0','10',headers)).httpStatusCode,403);
 for(const action of ['ini','game'])assert.equal((await req('/games/21.php?action='+action+'&uid='+uid)).httpStatusCode,403);
 for(const value of ['0','-1','1.5','1e2','9999999999','101','<script>','10x'])assert.equal((await act('start','0',value)).httpStatusCode,400);
 assert.equal((await act('nonsense','0','10')).httpStatusCode,400);assert.equal(profile()[41],initial);assert.equal(profile()[99],'');
 pass('guest, CSRF, cross-site, GET mutation, array injection, invalid commands and bet bounds rejected without changing game or balance');
 const beforeGet=profile()[99];await req('/games/21.php',null,{},'HEAD');await req('/games/21.php');assert.equal(profile()[99],beforeGet);
 r=await act('start','0','10');assert.equal(r.httpStatusCode,200,r.text);let g=state();assert.equal(+profile()[41],1000-10+(g.game.status==='won'?20:0));assert.equal(new Set([...g.game.player,...g.game.dealer,...g.game.deck]).size,36);
 const after=profile().join(':||:');r=await act('start','0','10');assert.equal(r.httpStatusCode,409);assert.equal(profile().join(':||:'),after);
 await req('/games/21.php');assert.equal(profile().join(':||:'),after);
 pass('start charges once; random deck has 36 unique cards; duplicate request and refresh do not re-deal or charge');
 function seed(player,dealer,deckFirst=[],status='playing'){
  const used=[...player,...dealer,...deckFirst];assert.equal(new Set(used).size,used.length);
  const deck=Array.from({length:36},(_,i)=>i+1).filter(i=>!used.includes(i)).concat([...deckFirst].reverse());
  const s={v:1,revision:randomBytes(16).toString('hex'),game:{bet:10,status,player,dealer,deck},rounds:0,wins:0,legacy:[]};setProfile(99,'g21:'+JSON.stringify(s));setProfile(41,'990');return s;
 }
 g=seed([1,21],[5,9],[13]);r=await req('/games/21.php');save('playing.html',r.text);assert.ok(!r.text.includes('Семёрка, пики'));
 const json=await req('/games/21.php',null,{accept:'application/json'});save('playing.json',json.text);assert.ok(!json.text.includes('"deck"'));assert.ok(!json.text.includes('Восьмёрка, пики'));assert.ok(!json.text.includes('"dealer"'));
 r=await act('hit',g.revision);assert.equal(r.httpStatusCode,200);assert.deepEqual(state().game.player,[1,21,13]);assert.equal(+profile()[41],990);save('hit.json',r.text);
 const afterHit=profile()[99];r=await act('hit',g.revision);assert.equal(r.httpStatusCode,409);assert.equal(profile()[99],afterHit);
 r=await act('start',state().revision,'10');assert.equal(r.httpStatusCode,409);
 r=await act('stand',state().revision);assert.equal(r.httpStatusCode,200);assert.notEqual(state().game.status,'playing');save('finished.json',r.text);save('finished.html',(await req('/games/21.php')).text);
 const finished=profile().join(':||:');await act('stand',g.revision);assert.equal(profile().join(':||:'),finished);
 pass('hidden dealer/deck not leaked; hit draws exactly one unique card; active round cannot be replaced; reveal settles once');
 for(const [player,dealer,deckFirst,expected] of [
  [[17,33],[13,14],[],'won'],[[33,34],[17,35],[],'lost'],[[33,34],[13,14],[],'won'],[[17,18],[19,20],[],'lost'],[[1,2,17],[13,14],[],'lost'],[[13,14],[21,25],[29,30,31],'won'],[[13,14],[17,18],[],'lost'],[[17,33],[18,34],[],'lost']
 ]){g=seed(player,dealer,deckFirst);r=await act('stand',g.revision);assert.equal(r.httpStatusCode,200,r.text);assert.equal(state().game.status,expected,JSON.stringify({player,dealer}));assert.equal(+profile()[41],990+(expected==='won'?20:0));assert.equal(state().rounds,1);assert.equal(state().wins,expected==='won'?1:0);const final=profile()[99];await act('stand',g.revision);assert.equal(profile()[99],final);}
 pass('21 beats two aces; two aces beat ordinary hands; ties including 21 go to banker; bust loses; banker takes multiple cards to 17; payout and statistics once');
 assert.equal(await pure('$ok=true;for($n=0;$n<500;$n++){$d=motor21_deck();sort($d);$ok=$ok&&$d===range(1,36);}echo json_encode($ok);'),true);
 assert.deepEqual(await pure('echo json_encode(array_map(fn($id)=>motor21_score([$id]),[1,5,9,13,17,21,25,29,33]));'),[6,7,8,9,10,2,3,4,11]);
 // Max bet is checked on the server; a hand already paid for can still finish after a limit change.
 g=seed([1,21],[5,9]);cfg[120]='0';write('config.dat',cfg.join('|'));assert.equal((await act('stand',g.revision)).httpStatusCode,200);assert.equal((await act('start',state().revision,'1')).httpStatusCode,400);cfg[120]='100';write('config.dat',cfg.join('|'));
 setProfile(41,'0');assert.equal((await act('start',state().revision,'1')).httpStatusCode,400);save('empty.html',(await req('/games/21.php')).text);
 pass('all original card values; 500 shuffled decks; zero balance/disabled betting; an existing round can finish when admin changes limit');
 // Old session stakes are refunded by explicit POST, once, even across a retry.
 setProfile(99,'');setProfile(41,'90');
 assert.deepEqual(await pure('$l=["id"=>str_repeat("a",64),"bet"=>10];$a=motor21_apply("CardAdmin","restore","0","",100,$l);$b=motor21_apply("CardAdmin","restore",$a["state"]["revision"],"",100,$l);echo json_encode([$a["balance"],$b["balance"],count($b["state"]["legacy"])]);'),[100,100,1]);
 assert.equal(await pure('$before=motor21_snapshot("CardAdmin");increment_profil("CardAdmin",[41=>1,12=>1]);change_profil("CardAdmin",[29=>"Новый ник"]);$after=motor21_snapshot("CardAdmin");echo json_encode($before["state"]===$after["state"]&&$after["balance"]===$before["balance"]+1);'),true);
 setProfile(99,'unrecognized existing data');assert.equal((await req('/games/21.php')).httpStatusCode,503);assert.equal(profile()[99],'unrecognized existing data');
 assert.equal(await pure('try{motor21_apply("../evil","start","0","1",100);echo "false";}catch(InvalidArgumentException $e){echo "true";}'),true);
 pass('old stake refund is idempotent; chat/profile writes preserve game state; unknown slot data fails closed; profile traversal rejected');
 // Ordinary HTML POST remains playable with JavaScript disabled (POST/redirect/GET).
 setProfile(99,'');setProfile(41,'100');r=await req('/games/21.php',{uid,command:'start',revision:'0',rules_revision:rulesRevision,bet:'1'});assert.equal(r.httpStatusCode,303);assert.equal(r.headers.location[0],'21.php#g21');assert.equal((await req('/games/21.php')).httpStatusCode,200);
 // A second login resumes the same account round; a different account cannot see it.
 const saved=profile()[99];await req('/input.php?action=exit',{uid});await req('/input.php',{login:'CardAdmin',pass:password});r=await req('/games/21.php');assert.ok(r.text.includes(state().revision));assert.equal(profile()[99],saved);
 let other=profile();other[0]='CardMember';other[7]='0';other[99]='';write('profil/CardMember.prof',other.join(':||:'));const newUid=r.text.match(/name="uid" value="([^"]+)"/)[1];await req('/input.php?action=exit',{uid:newUid});await req('/input.php',{login:'CardMember',pass:password});r=await req('/games/21.php');assert.ok(r.text.includes('data-revision="0"'));assert.ok(!r.text.includes(state().revision));
 pass('no-JavaScript POST/303 fallback; relogin resumes own round; another account has separate state');
 writeFileSync(new URL('./game21-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2)+'\n');console.log('SUCCESS',requests,'game HTTP checks');
} finally {php.exit();}
