<?php
// Build-time gate. It runs before the image can be deployed and never touches /data.
$root = '/var/www/html';
$count = 0;
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)) as $file) {
    if (!in_array($file->getExtension(), ['php', 'mot'], true)) continue;
    token_get_all(file_get_contents($file->getPathname()), TOKEN_PARSE);
    $count++;
}
foreach (['fileinfo','gd','mbstring','zip','session','json'] as $extension) {
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
foreach (['responsive.css', 'touch.js'] as $asset) if (!is_file($root.'/assets/lesika/'.$asset)) throw new RuntimeException('Missing touch asset');
echo 'PASS: 12 themes including five responsive web themes; shared touch assets'.PHP_EOL;
