import {PHP} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const passed=[];
try{
 php.mkdir('/www');php.mkdir('/www/includes');
 php.writeFile('/www/includes/portal-brand.php',readFileSync(root+'/includes/portal-brand.php'));
 php.writeFile('/migration.php',readFileSync(new URL('../migrate-branding.php',import.meta.url)));
 const seed=readFileSync(root+'/local/datalocal/config.dat','utf8');
 async function run(code){const r=await php.run({code:'<?php require "/migration.php";'+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0);return JSON.parse(r.text);}
 for(const d of ['/data','/data/local','/data/local/datalocal','/data/local/profil'])php.mkdir(d);
 php.writeFile('/data/local/config.dat',seed);php.writeFile('/data/local/datalocal/config.dat',seed);php.writeFile('/data/local/profil/Untouched.prof','PROFILE-MUST-NOT-CHANGE');
 let result=await run('echo json_encode(motorMigratePortalBrand("/data","/www"));');assert.equal(result.changed,2);
 const current=php.readFileAsText('/data/local/config.dat'),a=seed.split('|'),b=current.split('|');
 assert.equal(b[11],'Лесозаводск');assert.match(b[12],/Лесозаводска/);assert.equal(b[15],'assets/lesika/lesozavodsk.svg');assert.match(b[82],/Приморский край/);assert.match(b[83],/Россия/);
 for(let i=0;i<a.length;i++)if(![11,12,15,82,83].includes(i))assert.equal(a[i],b[i]);
 assert.equal(php.readFileAsText('/data/motor-backups/2026-10-20-lesozavodsk-r1/config.dat'),seed);
 assert.equal(php.readFileAsText('/data/motor-backups/2026-10-20-lesozavodsk-r1/datalocal/config.dat'),seed);
 assert.equal(php.readFileAsText('/data/local/profil/Untouched.prof'),'PROFILE-MUST-NOT-CHANGE');
 assert.equal((await run('echo json_encode(motorMigratePortalBrand("/data","/www"));')).status,'already-applied');assert.equal(php.readFileAsText('/data/local/config.dat'),current);
 passed.push('exact branding fields, immutable original backups, unchanged accounts/settings, idempotent repeat');
 result=await run('define("BASEDIR","/www/");require "/www/includes/portal-brand.php";$f=[11=>"Мой город",12=>"Своё приветствие",14=>"https://city.example",15=>"https://city.example/assets/lesika/leaf.svg",82=>"мои ключевые слова",83=>"Моё описание",96=>"private"];echo json_encode(motor_portal_brand_fields($f));');
 assert.equal(result[11],'Мой город');assert.equal(result[12],'Своё приветствие');assert.equal(result[15],'https://city.example/assets/lesika/lesozavodsk.svg');assert.equal(result[82],'мои ключевые слова');assert.equal(result[83],'Моё описание');assert.equal(result[96],'private');
 passed.push('custom metadata preserved, known previous logo URL upgraded');
 for(const name of ['bad','link','backup']){php.mkdir('/'+name);php.mkdir('/'+name+'/local');}
 php.writeFile('/bad/local/config.dat','broken');
 assert.equal(await run('try{motorMigratePortalBrand("/bad","/www");echo "false";}catch(RuntimeException $e){echo "true";}'),true);assert.equal(php.readFileAsText('/bad/local/config.dat'),'broken');
 await run('file_put_contents("/outside","outside");symlink("/outside","/link/local/config.dat");echo "true";');
 assert.equal(await run('try{motorMigratePortalBrand("/link","/www");echo "false";}catch(RuntimeException $e){echo "true";}'),true);assert.equal(php.readFileAsText('/outside'),'outside');
 php.writeFile('/backup/local/config.dat',seed);await run('mkdir("/backup/motor-backups",0700);symlink("/data","/backup/motor-backups/2026-10-20-lesozavodsk-r1");echo "true";');
 assert.equal(await run('try{motorMigratePortalBrand("/backup","/www");echo "false";}catch(RuntimeException $e){echo "true";}'),true);assert.equal(php.readFileAsText('/backup/local/config.dat'),seed);
 passed.push('malformed configuration and symlink destinations/backups fail without changing originals');
 const svg=readFileSync(root+'/assets/lesika/lesozavodsk.svg','utf8'),m=svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);assert.ok(m);const source=JSON.parse(readFileSync(new URL('../BRAND_ASSET_SOURCES.json',import.meta.url)));
 assert.equal(createHash('sha256').update(Buffer.from(m[1],'base64')).digest('hex'),source.original_sha256);assert.ok(!/<script|onload=|foreignObject|href="https?:/i.test(svg));
 passed.push('coat of arms equals official PNG bytes; SVG has no scripts, external assets or foreignObject');
 writeFileSync(new URL('./branding-results.json',import.meta.url),JSON.stringify({php:'8.4 WASM',passed},null,2));console.log('SUCCESS',passed.join('; '));
}finally{php.exit()}
