<?php
// Owner-requested recovery. Run once before Apache starts; never through HTTP.
function motorRestoreHome(string $dataRoot, string $source): array {
    $id = '2026-10-21-restore-home-v1';
    $expected = '577fcd0bc84a2b4f55bade258b0d56e3d24e4bb3cf66d183aee3e903bc3e4aad';
    $dataRoot = rtrim($dataRoot, '/');
    $markers = $dataRoot.'/.motor-migrations';
    $backupDir = $dataRoot.'/motor-backups/'.$id;
    $target = $dataRoot.'/local/datamain/index.dat';
    $backup = $backupDir.'/index.dat';
    $marker = $markers.'/'.$id.'.json';
    $lockPath = $markers.'/'.$id.'.lock';
    $safeFile = static function(string $path): void {
        if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Unsafe home recovery file');
    };
    foreach ([$dataRoot, $dataRoot.'/local', $dataRoot.'/local/datamain', $markers, $dataRoot.'/motor-backups', $backupDir] as $dir) {
        if (is_link($dir) || (file_exists($dir) && !is_dir($dir))) throw new RuntimeException('Unsafe home recovery directory');
    }
    if (!is_dir(dirname($target))) throw new RuntimeException('Missing home directory');
    foreach ([$target, $backup, $marker, $lockPath, $source] as $path) $safeFile($path);
    if (!is_file($target) || !is_file($source)) throw new RuntimeException('Missing home recovery file');
    if (!is_dir($markers) && !mkdir($markers, 0700, true) && !is_dir($markers)) throw new RuntimeException('Cannot create recovery marker directory');
    $lock = fopen($lockPath, 'c+b');
    if (!$lock) throw new RuntimeException('Cannot open home recovery lock');
    $atomic = static function(string $path, string $contents, int $mode): void {
        $temp = tempnam(dirname($path), '.home-restore-');
        if ($temp === false) throw new RuntimeException('Cannot stage home recovery');
        try {
            if (file_put_contents($temp, $contents, LOCK_EX) !== strlen($contents) || !chmod($temp, $mode) || !rename($temp, $path)) throw new RuntimeException('Cannot commit home recovery');
            $temp = null;
        } finally {if ($temp !== null) @unlink($temp);}
    };
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock home recovery');
        clearstatcache();
        if (is_file($marker)) {
            $done = json_decode(file_get_contents($marker), true, 32, JSON_THROW_ON_ERROR);
            if (($done['id'] ?? '') !== $id || ($done['after_sha256'] ?? '') !== $expected) throw new RuntimeException('Invalid home recovery marker');
            return ['status'=>'already-applied', 'changed'=>0];
        }
        $next = file_get_contents($source, false, null, 0, 65537);
        if ($next === false || !hash_equals($expected, hash('sha256', $next))) throw new RuntimeException('Unrecognized home recovery source');
        token_get_all($next, TOKEN_PARSE);
        $before = file_get_contents($target, false, null, 0, 2097153);
        if ($before === false || strlen($before) > 2097152) throw new RuntimeException('Invalid current home file');
        $beforeHash = hash('sha256', $before);
        $changed = $before !== $next;
        if ($changed) {
            if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true) && !is_dir($backupDir)) throw new RuntimeException('Cannot create home backup directory');
            if (is_file($backup)) {
                if (file_get_contents($backup) !== $before) throw new RuntimeException('Existing home backup differs; refusing overwrite');
            } else {
                $atomic($backup, $before, 0600);
            }
            if (!hash_equals($beforeHash, hash_file('sha256', $backup))) throw new RuntimeException('Home backup verification failed');
            // The old server must be stopped; also reject an unexpected intervening edit.
            if (!hash_equals($beforeHash, hash_file('sha256', $target))) throw new RuntimeException('Home changed during recovery');
            $atomic($target, $next, fileperms($target) & 0777);
        }
        if (!hash_equals($expected, hash_file('sha256', $target))) throw new RuntimeException('Restored home verification failed');
        $result = ['id'=>$id, 'status'=>$changed?'restored':'already-correct', 'changed'=>(int)$changed,
            'file'=>'local/datamain/index.dat', 'before_sha256'=>$beforeHash, 'after_sha256'=>$expected,
            'backup'=>$changed?$backup:null, 'completed_at'=>gmdate('c')];
        $atomic($marker, json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)."\n", 0600);
        return $result;
    } finally {flock($lock, LOCK_UN);fclose($lock);}
}
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $result = motorRestoreHome('/data', '/opt/motor-seed/local/datamain/index.dat');
    echo 'MOTOR: home recovery '.json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES).PHP_EOL;
}
