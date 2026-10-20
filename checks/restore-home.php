<?php
require $argv[1] ?? '/opt/motor-restore-home.php';
$source = $argv[2] ?? '/opt/motor-seed/local/datamain/index.dat';
$root = sys_get_temp_dir().'/motor-home-recovery-'.bin2hex(random_bytes(8));
$id = '2026-10-21-restore-home-v1';
$count = 0;
$check = static function(bool $ok) use (&$count): void {if (!$ok) throw new RuntimeException('Home recovery assertion failed: '.($count + 1));$count++;};
$seed = static function(string $name) use ($root): string {
    $dir = $root.'/'.$name;mkdir($dir.'/local/datamain', 0700, true);
    file_put_contents($dir.'/local/datamain/index.dat', '<?php broken accidental edit');
    file_put_contents($dir.'/local/home-settings.json', '{"keep":"selection-and-order"}');
    file_put_contents($dir.'/local/news.dat', 'Keep published news');
    return $dir;
};
try {
    $dir = $seed('restore');$old = file_get_contents($dir.'/local/datamain/index.dat');
    $r = motorRestoreHome($dir, $source);
    $check($r['status'] === 'restored' && $r['changed'] === 1);
    $check(file_get_contents($dir.'/local/datamain/index.dat') === file_get_contents($source));
    $backup = $dir.'/motor-backups/'.$id.'/index.dat';
    $check(file_get_contents($backup) === $old && (fileperms($backup) & 0777) === 0600);
    $check(file_get_contents($dir.'/local/home-settings.json') === '{"keep":"selection-and-order"}');
    $check(file_get_contents($dir.'/local/news.dat') === 'Keep published news');
    $check(motorRestoreHome($dir, $source)['status'] === 'already-applied');
    file_put_contents($dir.'/local/datamain/index.dat', 'Later intentional edit');
    $check(motorRestoreHome($dir, $source)['changed'] === 0);
    $check(file_get_contents($dir.'/local/datamain/index.dat') === 'Later intentional edit');
    $check(file_get_contents($backup) === $old);
    $dir = $seed('correct');copy($source, $dir.'/local/datamain/index.dat');
    $check(motorRestoreHome($dir, $source)['status'] === 'already-correct');
    $check(!is_file($dir.'/motor-backups/'.$id.'/index.dat'));
    foreach (['bad-source', 'target-link', 'directory-link', 'backup-link', 'marker-link', 'lock-link', 'backup-conflict', 'bad-marker'] as $case) {
        $dir = $seed($case);$target = $dir.'/local/datamain/index.dat';$outside = $dir.'/outside';file_put_contents($outside, 'Outside untouched');
        mkdir($dir.'/.motor-migrations', 0700);mkdir($dir.'/motor-backups/'.$id, 0700, true);
        $candidate = $source;
        if ($case === 'bad-source') $candidate = $outside;
        if ($case === 'target-link') {unlink($target);symlink($outside, $target);}
        if ($case === 'directory-link') {rename($dir.'/local/datamain', $dir.'/original');symlink($dir.'/original', $dir.'/local/datamain');}
        if ($case === 'backup-link') symlink($outside, $dir.'/motor-backups/'.$id.'/index.dat');
        if ($case === 'marker-link') symlink($outside, $dir.'/.motor-migrations/'.$id.'.json');
        if ($case === 'lock-link') symlink($outside, $dir.'/.motor-migrations/'.$id.'.lock');
        if ($case === 'backup-conflict') file_put_contents($dir.'/motor-backups/'.$id.'/index.dat', 'Previous backup');
        if ($case === 'bad-marker') file_put_contents($dir.'/.motor-migrations/'.$id.'.json', 'invalid');
        $prior = file_get_contents($target);$failed = false;
        try {motorRestoreHome($dir, $candidate);} catch (Throwable $e) {$failed = true;}
        $check($failed);$check(file_get_contents($target) === $prior);$check(file_get_contents($outside) === 'Outside untouched');
    }
    echo 'PASS: home recovery, '.$count.' assertions; exact source, private backup, idempotence, later edits preserved, settings/content unchanged, unsafe paths and backup conflicts refused'.PHP_EOL;
} finally {
    if (is_dir($root)) {
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $file) {
            ($file->isDir() && !$file->isLink()) ? rmdir($file->getPathname()) : unlink($file->getPathname());
        }
        rmdir($root);
    }
}
