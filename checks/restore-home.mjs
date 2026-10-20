import {PHP} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const php = new PHP(await loadNodeRuntime('8.4', {emscriptenOptions:{processId:process.pid}}));
try {
  php.writeFile('/restore-home.php', readFileSync(new URL('../restore-home.php', import.meta.url)));
  php.writeFile('/check.php', readFileSync(new URL('./restore-home.php', import.meta.url)));
  php.writeFile('/index.dat', readFileSync((process.argv[2] || '.test-site')+'/local/datamain/index.dat'));
  const result = await php.run({code:'<?php $argv=["test","/restore-home.php","/index.dat"]; require "/check.php";'});
  assert.equal(result.errors, '');assert.equal(result.exitCode, 0, result.text);assert.match(result.text, /PASS: home recovery, 35 assertions/);
  console.log(result.text.trim());
} finally {php.exit();}
