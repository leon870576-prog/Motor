<?php
// Build-time gate. It runs before the image can be deployed and never touches /data.
$root = '/var/www/html';
$count = 0;
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)) as $file) {
    if (!in_array($file->getExtension(), ['php', 'mot'], true)) continue;
    token_get_all(file_get_contents($file->getPathname()), TOKEN_PARSE);
    $count++;
}
foreach (['fileinfo','gd','exif','mbstring','zip','session','json'] as $extension) {
    if (!extension_loaded($extension)) throw new RuntimeException('Missing PHP extension: '.$extension);
}
if (ini_get('upload_max_filesize') !== '32M' || ini_get('post_max_size') !== '64M') throw new RuntimeException('Unexpected upload limits');
echo 'PASS: PHP '.PHP_VERSION.' syntax for '.$count.' files; required media extensions and upload limits'.PHP_EOL;
define('BASEDIR', '/');
require $root.'/includes/smiles.php';
$config = ['resmiles' => 2];
$sample = '12:30 https://example.test/:D :) :hello :cry 😊 👍🏽';
$rendered = motor_smiles_render($sample);
if (substr_count($rendered, 'class="motor-smile"') !== 2 || nosmiles($rendered) !== $sample || motor_smiles_render($rendered) !== $rendered) throw new RuntimeException('Smile rendering regression');
$smileCount = 0;
foreach (motor_smile_catalog() as $group => $names) foreach ($names as $name => $_) {
    if (!getimagesize($root.'/images/'.$group.'/'.$name.'.gif')) throw new RuntimeException('Invalid smile GIF');
    $smileCount++;
}
if ($smileCount !== 121) throw new RuntimeException('Incomplete smile catalogue');
echo 'PASS: native PHP smile renderer, emoji roundtrip, limits, and '.$smileCount.' GIF assets'.PHP_EOL;
require_once $root.'/includes/lesika/catalog.php';
$themes = lesika_themes();
if (count($themes) !== 12 || count(array_filter($themes, fn($theme) => ($theme['layout'] ?? '') === 'web')) !== 5) throw new RuntimeException('Incomplete theme catalogue');
foreach ($themes as $id => $theme) {
    if (!preg_match('/^lesika_[a-z_]+$/D', $id) || !is_file($root.'/themes/'.$id.'/index.php') || !is_file($root.'/themes/'.$id.'/foot.php')) throw new RuntimeException('Invalid theme entry');
}
foreach (['responsive.css', 'touch.js', 'gallery.css', 'gallery.js'] as $asset) if (!is_file($root.'/assets/lesika/'.$asset)) throw new RuntimeException('Missing touch asset');
echo 'PASS: 12 themes including five responsive web themes; shared touch assets'.PHP_EOL;

require_once $root.'/includes/bbcode.php';
if (motor_bb_render('[b]Тест[/b]') !== '<b>Тест</b>' ||
    !str_contains(motor_bb_render('[url=https://example.test]Сайт[/url]'), 'href="https://example.test"') ||
    str_contains(motor_bb_render('[url=javascript:alert(1)]X[/url]'), '<a ') ||
    str_contains(motor_bb_render('<script>alert(1)</script>'), '<script')) throw new RuntimeException('BBCode security regression');
$avatarCount = 0;
foreach (['avators','avators2'] as $folder) foreach (glob($root.'/images/'.$folder.'/*.gif') as $file) {
    $size = getimagesize($file);
    if (!$size || $size[0] !== 128 || $size[1] !== 128 || $size[2] !== IMAGETYPE_GIF) throw new RuntimeException('Invalid avatar asset');
    $avatarCount++;
}
if ($avatarCount !== 402 || !is_file($root.'/assets/lesika/tag-picker.js')) throw new RuntimeException('Incomplete editor/avatar assets');
echo 'PASS: native safe BBCode renderer, HTTPS links and '.$avatarCount.' avatars at 128px'.PHP_EOL;
foreach (['mag','bot','shut'] as $name) {
    $size = getimagesize($root.'/images/img/'.$name.'.gif');
    if (!$size || $size[0] !== 256 || $size[1] !== 256 || $size[2] !== IMAGETYPE_GIF) throw new RuntimeException('Invalid chat avatar asset');
}
echo 'PASS: all 3 generated chat avatars at 256px with original filenames'.PHP_EOL;

require_once $root.'/includes/compression.php';
$compressionCases = ['gzip'=>'gzip', 'deflate'=>'deflate', 'GZIP'=>'gzip', 'gzip;q=0,deflate;q=0'=>'identity', 'gzip;q=0.2,deflate;q=0.8'=>'deflate', 'gzip;q=0,*;q=1'=>'deflate', 'identity;q=1,gzip;q=0.5'=>'identity', '*;q=0'=>'', 'notgzip'=>'identity', ''=>'identity'];
foreach ($compressionCases as $accept=>$expected) if (motor_compression_encoding($accept) !== $expected) throw new RuntimeException('Compression negotiation: '.$accept);
$compressionSample = str_repeat('Сжатие HTML без потери данных 😊 ', 200);
if (gzdecode(compress_output_gzip($compressionSample)) !== $compressionSample || gzuncompress(compress_output_deflate($compressionSample)) !== $compressionSample) throw new RuntimeException('Compression roundtrip');
echo 'PASS: native gzip and HTTP deflate/zlib roundtrip; encoding preferences, refusals and identity'.PHP_EOL;

require_once $root.'/includes/nastya.php';
$chatSettings = ['bot_enabled'=>1,'bot_mode'=>'conversation','bot_cooldown'=>0,'context_seconds'=>180,'custom_rules'=>[]];
$chatContext = [];
if (count(motor_nastya_topics()) < 30) throw new RuntimeException('Incomplete conversation catalogue');
foreach (motor_nastya_topics() as [$pattern,$answers]) if (($pattern !== '' && preg_match('~(*UCP)'.$pattern.'~u','') === false) || count($answers) < 3) throw new RuntimeException('Invalid conversation topic');
if (motor_nastya_reply('Настя, что слушаешь из музыки?', $chatContext, $chatSettings, 10000) === null || $chatContext['topic'] !== 'music') throw new RuntimeException('Conversation intent');
if (motor_nastya_reply('да', $chatContext, $chatSettings, 10001) === null || $chatContext['topic'] !== 'music') throw new RuntimeException('Conversation context');
if (motor_nastya_reply('[b]Другой[/b], привет', $chatContext, $chatSettings, 10002) !== null) throw new RuntimeException('Conversation recipient');
foreach (['chat.css','chat.js'] as $asset) if (!is_file($root.'/assets/lesika/'.$asset)) throw new RuntimeException('Missing chat asset');
echo 'PASS: native Nastya Unicode topics, conversational context, recipient isolation and chat assets'.PHP_EOL;
