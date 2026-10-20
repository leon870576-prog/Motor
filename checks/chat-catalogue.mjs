import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site';
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
try {
  php.mkdir('/www');php.mkdir('/www/includes');php.mkdir('/www/chat');
  for (const f of ['includes/smiles.php','includes/nastya.php','includes/nastya-legacy.php','includes/nastya-everyday.php','includes/nastya-everyday.json','includes/chat-jokes.php','includes/chat_shut.php','chat/joke-sources.json']) php.writeFile('/www/'+f,readFileSync(root+'/'+f));
  php.writeFile('/check.php',readFileSync('checks/chat-catalogue.php'));
  const r=await php.run({code:`<?php define('BASEDIR','/');require '/www/includes/smiles.php';require '/check.php';echo json_encode(motor_check_chat_catalogue('/www'));`});
  assert.equal(r.errors,'');assert.equal(r.exitCode,0,r.text);const result=JSON.parse(r.text);
  writeFileSync('checks/chat-catalogue-results.json',JSON.stringify({php:'8.4 WASM',...result},null,2)+'\n');
  console.log('PASS chat catalogue',JSON.stringify(result));
} finally {php.exit();}
