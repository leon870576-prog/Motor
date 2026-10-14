<?php
// One-time migration from the originally deployed archive to the owner's latest build.
// Values changed by the owner are preserved. Originals are backed up outside the web root.
function motorMigrateLatestBuild(string $dataRoot, string $seedRoot, string $manifestPath): array
{
    $manifest = json_decode(file_get_contents($manifestPath), true, 512, JSON_THROW_ON_ERROR);
    $id = $manifest['id'];
    if (!preg_match('/^[a-z0-9-]+$/', $id)) throw new RuntimeException('Invalid migration id');
    $markerDir = $dataRoot . '/.motor-migrations';
    $marker = $markerDir . '/' . $id . '.json';
    if (is_file($marker)) return ['status' => 'already-applied', 'changed' => 0];
    $backupRoot = $dataRoot . '/motor-backups/' . $id;
    $changed = [];
    $replace = static function (string $relative, string $content) use ($dataRoot, $backupRoot, &$changed): void {
        $path = $dataRoot . '/local/' . $relative;
        if (!is_file($path) || file_get_contents($path) === $content) return;
        $backup = $backupRoot . '/' . $relative;
        if (!is_dir(dirname($backup)) && !mkdir(dirname($backup), 0700, true)) {
            throw new RuntimeException('Cannot create backup directory');
        }
        if (!is_file($backup) && !copy($path, $backup)) throw new RuntimeException('Cannot back up data');
        chmod($backup, 0600);
        $temporary = tempnam(dirname($path), '.motor-update-');
        if ($temporary === false) throw new RuntimeException('Cannot create update file');
        if (file_put_contents($temporary, $content) !== strlen($content)) {
            @unlink($temporary);
            throw new RuntimeException('Cannot write update');
        }
        chmod($temporary, fileperms($path) & 0777);
        if (!rename($temporary, $path)) throw new RuntimeException('Cannot install update');
        $changed[] = $relative;
    };
    foreach (['datalocal/config.dat', 'config.dat'] as $relative) {
        $path = $dataRoot . '/local/' . $relative;
        if (!is_file($path)) continue;
        $fields = explode('|', file_get_contents($path));
        foreach ($manifest['config_fields'] as $index => $change) {
            if (isset($fields[$index]) && $fields[$index] === $change['from']) {
                $fields[$index] = $change['to'];
            }
        }
        $replace($relative, implode('|', $fields));
    }
    foreach ($manifest['replace_files'] as $file) {
        $relative = $file['path'];
        $path = $dataRoot . '/local/' . $relative;
        $seed = $seedRoot . '/' . $relative;
        if (is_file($path) && hash_file('sha256', $path) === $file['old_sha256']) {
            if (!is_file($seed)) throw new RuntimeException('Migration seed missing');
            $replace($relative, file_get_contents($seed));
        }
    }
    if (!is_dir($markerDir) && !mkdir($markerDir, 0700, true)) throw new RuntimeException('Cannot create marker directory');
    $result = ['status' => 'applied', 'changed' => count($changed), 'files' => $changed];
    if (file_put_contents($marker, json_encode($result, JSON_THROW_ON_ERROR)) === false) {
        throw new RuntimeException('Cannot save migration marker');
    }
    chmod($marker, 0600);
    return $result;
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $result = motorMigrateLatestBuild('/data', '/opt/motor-seed/local', '/opt/motor-migration.json');
    echo 'MOTOR: latest build data migration ' . $result['status'] . '; changed ' . $result['changed'] . ' files' . PHP_EOL;
}
