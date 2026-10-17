import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const fixtureDir=new URL('./touch-fixtures/',import.meta.url);mkdirSync(fixtureDir,{recursive:true});
const fixtures=[];
function capture(response,url,role,theme='lesika_dvor'){const file=fixtures.length+'.html';writeFileSync(new URL(file,fixtureDir),response.text);fixtures.push({file,url,role,theme});}
const source = process.argv[2] || fileURLToPath(new URL('../site', import.meta.url));
const php = new PHP(await loadNodeRuntime('8.4', { emscriptenOptions: { processId: process.pid } }));
function copy(root, target) {
  if (!php.fileExists(target)) php.mkdir(target);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const from = join(root, entry.name), to = target + '/' + entry.name;
    if (entry.isDirectory()) copy(from, to); else php.writeFile(to, readFileSync(from));
  }
}
try {
  copy(source, '/www');
  await setPhpIniEntries(php, { allow_url_fopen: '0', sendmail_path: '/bin/false' });
  const lint = await php.run({ code: `<?php $bad=[]; $n=0; foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator('/www')) as $file) { if(!in_array($file->getExtension(),['php','mot']))continue; $n++; try { token_get_all(file_get_contents($file->getPathname()), TOKEN_PARSE); } catch(Throwable $e) {$bad[]=$file->getPathname().': '.$e->getMessage();} } echo json_encode(['files'=>$n,'errors'=>$bad]);` });
  assert.deepEqual(JSON.parse(lint.text).errors, []);
  console.log('PHP 8.4 syntax:', lint.text);
  // Reproduce the live failure: the first hour/day rollover with no history files.
  const previousBucket=Math.floor(Date.now()/1000)-90000;
  php.writeFile('/www/local/datacounter/hits.dat', `00|3|8|99|2|${previousBucket}|`);
  php.writeFile('/www/local/datacounter/host.dat', `00|2|5|99|1|${previousBucket}|`);
  for (const name of ['24_hits.dat','31_hits.dat','24_host.dat','31_host.dat']) {
    const path = '/www/local/datacounter/' + name;
    if (php.fileExists(path)) php.unlink(path);
  }
  const handler = new PHPRequestHandler({ php, documentRoot: '/www', absoluteUrl: 'https://motor.test' });
  async function request(options) {
    // Apache starts a PHP script in that script's directory.
    php.chdir('/www' + dirname(new URL(options.url, 'https://motor.test').pathname));
    const response = await handler.request(options);
    assert.equal(response.errors, '', options.url);
    return response;
  }
  assert.equal((await request({ url: '/index.php' })).httpStatusCode, 302);
  assert.equal((await request({ url: '/INSTALL.php' })).httpStatusCode, 200);
  for (const name of ['24_hits.dat','31_hits.dat','24_host.dat','31_host.dat']) assert.ok(php.fileExists('/www/local/datacounter/' + name), name);
  console.log('PASS missing history and hour/day rollover');
  const password = randomBytes(10).toString('hex');
  const setup = await request({ url: '/INSTALL.php?action=install', method: 'POST', body: {
    name: 'MotorTestAdmin', password, password2: password, oemails: 'admin@example.test', osite: 'https://motor.test'
  }});
  assert.equal(setup.httpStatusCode, 200);
  assert.ok(php.fileExists('/www/local/profil/MotorTestAdmin.prof'));
  for (const path of ['/index.php', '/news/index.php', '/forum/index.php', '/book/index.php', '/gallery/index.php', '/pages/registration.php', '/pages/login.php','/pages/themes.php','/board/index.php','/chat/index.php']) {
    const r = await request({ url: path });
    assert.equal(r.httpStatusCode, 200, path);
    assert.ok(r.text.length > 1000, path);
    if (path === '/index.php') {
      assert.ok(r.text.includes('Лесика'));
      assert.ok(!r.text.includes('© VISAVI.NET'));
      assert.ok(!r.text.includes('Все для WAP-Motor'));
    }
    if (path === '/news/index.php') assert.ok(r.text.includes('Ура! Мы установили'));
    capture(r,path,'guest');console.log('PASS', path);
  }
  const login = await request({ url: '/input.php', method: 'POST', body: { login: 'MotorTestAdmin', pass: password, cookietrue: '1' } });
  assert.equal(login.httpStatusCode, 302);
  const admin = await request({ url: '/mpanel/index.php' });
  assert.equal(admin.httpStatusCode, 200);
  assert.ok(admin.text.includes('Панель управления'));
  const bb = await php.run({ code: '<?php define("BASEDIR", "/www/"); require_once "/www/includes/functions.php"; echo bb_code("Текст [b]жирный[/b] [code]echo 1;[/code]");' });
  assert.equal(bb.errors, '');
  assert.ok(bb.text.includes('<b>жирный</b>'));
  assert.ok(bb.text.includes('echo'));
  
  const ids = Object.keys(JSON.parse(readFileSync(join(source,'includes/lesika/themes.json'))));assert.equal(ids.length,12);
  assert.deepEqual(readdirSync(join(source, 'themes')).sort(), [...ids].sort());
  for (const id of ids) {
    const picker = await request({ url: '/pages/themes.php' });
    assert.equal(picker.httpStatusCode, 200);
    assert.equal((picker.text.match(/class="theme-card"/g) || []).length, 12);
    const token = picker.text.match(/name="uid" value="([^"]+)"/)[1];
    const chosen = await request({ url: '/pages/skin.php', method: 'POST', body: { skins: id, uid: token, return: 'themes' } });
    assert.equal(chosen.httpStatusCode, 303, id);
    assert.equal(php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:')[20], id);
    for (const url of ['/index.php','/news/index.php','/forum/index.php','/book/index.php','/pages/themes.php']) {
      const page = await request({ url });
      assert.equal(page.httpStatusCode, 200, id + url);
      assert.ok(page.text.includes('<body data-theme="' + id + '">'), id + url);
      assert.ok(page.text.includes('name="viewport"'));
      assert.ok(!page.text.includes('/themes/default/') && !page.text.includes('/themes/toonel/'));
      assert.ok(!page.text.includes('Fatal error'));
      if(['/index.php','/pages/themes.php'].includes(url))capture(page,url,'admin',id);
    }
    console.log('PASS palette, selection and profile persistence:', id);
  }
  for(const url of ['/mpanel/index.php','/mpanel/attachments.php','/mpanel/setting.php?action=setone','/pages/setting.php','/pages/index.php?action=menu','/pages/anketa.php?uz=MotorTestAdmin','/pages/userlist.php','/votes/index.php','/games/index.php','/pages/index.php?action=info']){const response=await request({url});assert.equal(response.httpStatusCode,200,url);capture(response,url,'admin','lesika_web_evening');}
  const personal = await request({url:'/pages/setting.php'});
  assert.ok(personal.text.includes('Тёплый двор'));
  assert.ok(!personal.text.includes('value="default"'));
  const settings = await request({url:'/mpanel/setting.php?action=setone'});
  assert.equal(settings.httpStatusCode, 200);
  assert.ok(settings.text.includes('Вечерний уют'));
  assert.ok(!settings.text.includes('value="toonel"'));
  const badToken = await request({url:'/pages/skin.php',method:'POST',body:{skins:'lesika_dvor',uid:'wrong'}});
  assert.equal(badToken.httpStatusCode, 403);
  assert.equal(php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:')[20], 'lesika_web_evening');
  const retired = await request({url:'/pages/skin.php?skins=default'});
  assert.equal(retired.httpStatusCode, 400);
  const beforeProfile=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof');
  for(const body of [{skins:'../local',uid:'wrong'},{'skins[0]':'lesika_dvor',uid:'wrong'},{skins:'lesika_dvor','uid[0]':'wrong'}]){const bad=await request({url:'/pages/skin.php',method:'POST',body});assert.ok([400,403].includes(bad.httpStatusCode));assert.equal(php.readFileAsText('/www/local/profil/MotorTestAdmin.prof'),beforeProfile);}
  writeFileSync(new URL('manifest.json',fixtureDir),JSON.stringify(fixtures,null,2));
  writeFileSync(new URL('./touch-backend-results.json',import.meta.url),JSON.stringify({php:'8.4',syntax:JSON.parse(lint.text),themes:ids,themed_pages:ids.length*5,fixtures:fixtures.length,invalid_themes_and_tokens_rejected:true},null,2));
  console.log('PASS: 12 palettes, 60 themed pages, profile persistence, settings, rejected invalid/array token and theme.');

} finally { php.exit(); }
