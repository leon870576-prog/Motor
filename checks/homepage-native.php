<?php
$root='/var/www/html';
function homeNativeSetup(string $dir): void {
    global $root,$config;
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/home-settings.php';
    $config=['userprofkey'=>100];$_SERVER['REQUEST_METHOD']='POST';$_SESSION=['log'=>'HomeAdmin','par'=>'test-password','token'=>'native-csrf'];$_POST=['uid'=>'native-csrf'];
}
function homeNativeForm(array $s): array {
    $f=['uid'=>'native-csrf','version'=>motor_home_version($s),'operation'=>'settings'];
    foreach ($s['order'] as $i=>$key) {$f['position_'.$key]=(string)($i+1);$f['count_'.$key]='3';$f['mode_'.$key]=$key==='board'?'selected':'latest';$f['photos_'.$key]=$s['blocks'][$key]['photos']?'1':'0';$f['videos_'.$key]=$s['blocks'][$key]['videos']?'1':'0';}
    $f['gallery_width']=(string)$s['gallery_size']['width'];$f['gallery_height']=(string)$s['gallery_size']['height'];
    return $f;
}
if (($argv[1]??'')==='worker') {
    homeNativeSetup($argv[2]);$f=homeNativeForm(motor_home_defaults());$n=(int)$argv[3];$f['count_news']=(string)($n+1);$f['gallery_width']=(string)(120+$n);$f['photos_news']=(string)($n%2);$f['videos_board']=(string)($n%2);
    try {motor_home_save($f);echo 'saved';}catch(RuntimeException $e){if($e->getCode()!==409)throw $e;echo 'stale';}exit;
}
$dir=sys_get_temp_dir().'/motor-home-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);$processes=[];
try {
    homeNativeSetup($dir);$p=array_fill(0,100,'0');$p[0]='HomeAdmin';$p[1]=md5(md5('test-password'));$p[4]='native@example.test';$p[7]='101';$p[37]='0';$profile=implode(':||:',$p);file_put_contents($dir.'/profil/HomeAdmin.prof',$profile);file_put_contents($dir.'/news.dat','unchanged news');
    for ($i=0;$i<8;$i++) {$p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$i.'.log','w'],2=>['file',$dir.'/'.$i.'.err','w']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start homepage worker');$processes[]=$p;}
    foreach ($processes as $p) if (proc_close($p)!==0) throw new RuntimeException('Homepage worker failed');$processes=[];
    $saved=0;$stale=0;
    for ($i=0;$i<8;$i++) {if(file_get_contents($dir.'/'.$i.'.err')!=='')throw new RuntimeException('Homepage worker warning');$v=file_get_contents($dir.'/'.$i.'.log');$saved+=($v==='saved');$stale+=($v==='stale');}
    if ($saved!==1 || $stale!==7) throw new RuntimeException('Concurrent settings saves lost their version guard');
    $s=motor_home_settings();$winner=$s['blocks']['news']['count']-1;
    if ($s['gallery_size']['width']!==120+$winner || $s['blocks']['news']['photos']!==(bool)($winner%2) || $s['blocks']['board']['videos']!==(bool)($winner%2)) throw new RuntimeException('Concurrent saves mixed media settings from different writers');
    $old=homeNativeForm($s);$next=$old;$next['count_news']='20';motor_home_save($next);$back=homeNativeForm(motor_home_settings());$back['count_news']=(string)$s['blocks']['news']['count'];motor_home_save($back);
    try {motor_home_save($old);throw new LogicException('ABA stale form accepted');}catch(RuntimeException $e){if($e->getCode()!==409)throw $e;}
    if(file_get_contents($dir.'/profil/HomeAdmin.prof')!==$profile || file_get_contents($dir.'/news.dat')!=='unchanged news')throw new RuntimeException('Homepage settings modified source/user data');
    echo 'PASS: homepage settings, eight concurrent writers -> one complete media/size save and seven stale refusals; ABA revision guard, valid JSON, unchanged profiles and content'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f)$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());rmdir($dir);
}
