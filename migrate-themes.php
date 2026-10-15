<?php
// Replace retired theme preferences, leaving all other user fields intact.
function motorMigrateLesikaThemes(string $dataRoot, string $catalogFile): array {
    require_once $catalogFile;
    $id = '2026-10-15-lesika-themes-v1';
    $marker = $dataRoot.'/.motor-migrations/'.$id.'.json';
    if (is_file($marker)) return ['status'=>'already-applied','changed'=>0,'profiles'=>0];
    $backupRoot = $dataRoot.'/motor-backups/'.$id;
    $changed = 0; $profiles = 0;
    $save = static function(string $relative, string $content) use ($dataRoot, $backupRoot, &$changed): void {
        $path = $dataRoot.'/local/'.$relative;
        if (file_get_contents($path) === $content) return;
        $backup = $backupRoot.'/'.$relative;
        if (!is_dir(dirname($backup)) && !mkdir(dirname($backup),0700,true)) throw new RuntimeException('Theme backup directory failed');
        if (!is_file($backup) && !copy($path,$backup)) throw new RuntimeException('Theme backup failed');
        chmod($backup,0600);
        $temp = tempnam(dirname($path),'.theme-update-');
        if ($temp === false || file_put_contents($temp,$content) !== strlen($content)) throw new RuntimeException('Theme update write failed');
        chmod($temp,fileperms($path) & 0777);
        if (!rename($temp,$path)) throw new RuntimeException('Theme update rename failed');
        $changed++;
    };
    foreach (['config.dat','datalocal/config.dat'] as $relative) {
        $path = $dataRoot.'/local/'.$relative;
        if (!is_file($path)) continue;
        $fields = explode('|',file_get_contents($path));
        if (isset($fields[2])) $fields[2] = lesika_theme_id($fields[2]);
        if (!empty($fields[113])) $fields[113] = lesika_theme_id($fields[113]);
        $save($relative,implode('|',$fields));
    }
    foreach (glob($dataRoot.'/local/profil/*.prof') as $path) {
        $fields = explode(':||:',file_get_contents($path));
        if (!isset($fields[20])) continue;
        $newTheme = lesika_theme_id($fields[20]);
        if ($newTheme === $fields[20]) continue;
        $fields[20] = $newTheme;
        $save('profil/'.basename($path),implode(':||:',$fields));
        $profiles++;
    }
    $cache = $dataRoot.'/local/datatmp/themes.dat';
    if (is_file($cache)) $save('datatmp/themes.dat','');
    if (!is_dir(dirname($marker)) && !mkdir(dirname($marker),0700,true)) throw new RuntimeException('Theme marker directory failed');
    $result = ['status'=>'applied','changed'=>$changed,'profiles'=>$profiles];
    if (file_put_contents($marker,json_encode($result,JSON_THROW_ON_ERROR)) === false) throw new RuntimeException('Theme marker write failed');
    chmod($marker,0600);
    return $result;
}
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $result = motorMigrateLesikaThemes('/data','/var/www/html/includes/lesika/catalog.php');
    echo 'MOTOR: Lesika themes migration '.$result['status'].'; changed '.$result['changed'].' files; profiles '.$result['profiles'].PHP_EOL;
}
