<?php
// Independent native workers exercise advisory file locks in an isolated temporary directory.
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');define('SITETIME',time());
    require $root.'/includes/functions.php';$config=['userprofkey'=>100];
    for($i=0;$i<40;$i++){
        increment_profil('CounterTest',[12=>1,36=>1]);
        change_profil('CounterTest',[29=>'worker']);
        statistics(8);
        motor_info_traffic_tick('hits',1);
    }
    exit;
}
$dir=sys_get_temp_dir().'/motor-informers-'.bin2hex(random_bytes(8));
mkdir($dir,0700);mkdir($dir.'/profil');mkdir($dir.'/datacounter');
$d=array_fill(0,100,'0');$d[0]='CounterTest';$d[1]='test-hash';$d[4]='test@example.invalid';
file_put_contents($dir.'/profil/CounterTest.prof',implode(':||:',$d).':||:');
file_put_contents($dir.'/local.dat',str_repeat('0|',11));
file_put_contents($dir.'/datacounter/hits.dat',date('d').'|0|0|'.date('H').'|0|'.time().'|');
$processes=[];
try {
    for($i=0;$i<6;$i++){
        $pipes=[];$p=proc_open([PHP_BINARY,__FILE__,'worker',$dir],[0=>['file','/dev/null','r'],1=>['file',$dir.'/worker-'.$i.'.log','a'],2=>['file',$dir.'/worker-'.$i.'.log','a']],$pipes);
        if(!is_resource($p))throw new RuntimeException('Cannot start counter worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Counter worker failed');
    $processes=[];
    $d=explode(':||:',file_get_contents($dir.'/profil/CounterTest.prof'));
    $s=explode('|',file_get_contents($dir.'/local.dat'));$h=explode('|',file_get_contents($dir.'/datacounter/hits.dat'));
    if((int)$d[12]!==240 || (int)$d[36]!==240 || (int)$s[8]!==240 || (int)$h[2]!==240 || $d[1]!=='test-hash' || $d[4]!=='test@example.invalid')throw new RuntimeException('Concurrent counter update lost data');
    foreach(glob($dir.'/worker-*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Worker warning: '.file_get_contents($log));
    echo 'PASS: native informers, six concurrent workers, 240 profile/statistic/hit increments preserved'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
