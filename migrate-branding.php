<?php
// Run before the web server starts, or with a hosted site temporarily stopped.
// Only the two configuration files are changed; backups stay outside the web root.
function motorMigratePortalBrand(string $dataRoot,string $codeRoot,bool $online=false): array {
    if (!defined('BASEDIR')) define('BASEDIR',rtrim($codeRoot,'/').'/');
    require_once $codeRoot.'/includes/portal-brand.php';
    $id=$online?'2026-10-21-brand-settings-r1':'2026-10-20-lesozavodsk-r1';$dataRoot=rtrim($dataRoot,'/');
    $local=$dataRoot.'/local';$markers=$dataRoot.'/.motor-migrations';$backups=$dataRoot.'/motor-backups';
    foreach ([$dataRoot,$local,$markers,$backups,$backups.'/'.$id] as $dir) {
        if (is_link($dir) || (file_exists($dir) && !is_dir($dir))) throw new RuntimeException('Unsafe branding migration directory');
    }
    if (!is_dir($local)) throw new RuntimeException('Missing data directory');
    if (!is_dir($markers) && !mkdir($markers,0700,true)) throw new RuntimeException('Cannot create migration directory');
    $lockPath=$markers.'/'.$id.'.lock';$marker=$markers.'/'.$id.'.json';
    if (is_link($lockPath) || is_link($marker) || (file_exists($lockPath) && !is_file($lockPath)) || (file_exists($marker) && !is_file($marker))) throw new RuntimeException('Unsafe migration marker');
    $lock=fopen($lockPath,'c+b');if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('Cannot lock branding migration');
    $changed=[];
    try {
        if (is_file($marker)) return ['status'=>'already-applied','changed'=>0,'files'=>[]];
        foreach (['config.dat','datalocal/config.dat'] as $relative) {
            $path=$local.'/'.$relative;
            if (is_link(dirname($path)) || is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Unsafe configuration file');
            if (!is_file($path)) continue;
            $raw=file_get_contents($path,false,null,0,2097153);
            if ($raw===false || strlen($raw)>2097152) throw new RuntimeException('Invalid configuration file');
            $fields=explode('|',$raw);if (count($fields)<84) throw new RuntimeException('Incomplete configuration file');
            $next=implode('|',$online?motor_portal_online_fields($fields):motor_portal_brand_fields($fields));if ($next===$raw) continue;
            $backup=$backups.'/'.$id.'/'.$relative;
            if (!is_dir(dirname($backup)) && !mkdir(dirname($backup),0700,true)) throw new RuntimeException('Cannot create branding backup directory');
            if (is_link(dirname($backup)) || is_link($backup) || (file_exists($backup) && !is_file($backup))) throw new RuntimeException('Unsafe branding backup');
            if (is_file($backup) && file_get_contents($backup)!==$raw) throw new RuntimeException('Existing branding backup does not match the source');
            if (!file_exists($backup)) {
                $fp=fopen($backup,'xb');if (!$fp) throw new RuntimeException('Cannot create branding backup');
                try {if (fwrite($fp,$raw)!==strlen($raw) || !fflush($fp)) throw new RuntimeException('Cannot save branding backup');} finally {fclose($fp);}
                chmod($backup,0600);
            }
            $tmp=tempnam(dirname($path),'.brand-');if ($tmp===false) throw new RuntimeException('Cannot stage branding configuration');
            try {
                if (file_put_contents($tmp,$next)!==strlen($next) || !chmod($tmp,fileperms($path)&0777) || !rename($tmp,$path)) throw new RuntimeException('Cannot update branding configuration');
                $tmp=null;$changed[]=$relative;
            } finally {if ($tmp!==null) @unlink($tmp);}
        }
        $result=['status'=>'applied','changed'=>count($changed),'files'=>$changed];
        $tmp=tempnam($markers,'.brand-');if ($tmp===false) throw new RuntimeException('Cannot stage branding marker');
        try {if (file_put_contents($tmp,json_encode($result,JSON_THROW_ON_ERROR))===false || !chmod($tmp,0600) || !rename($tmp,$marker)) throw new RuntimeException('Cannot save branding marker');$tmp=null;} finally {if ($tmp!==null) @unlink($tmp);}
        return $result;
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}
if (PHP_SAPI==='cli' && realpath($_SERVER['SCRIPT_FILENAME']??'')===__FILE__) {
    $result=motorMigratePortalBrand($argv[1]??'/data',$argv[2]??'/var/www/html');
    echo 'MOTOR: portal branding '.json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
    $result=motorMigratePortalBrand($argv[1]??'/data',$argv[2]??'/var/www/html',true);
    echo 'MOTOR: portal title '.json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
}
