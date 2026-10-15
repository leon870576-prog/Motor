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
