<?php
$root='/var/www/html';
function bottomNativeSetup(string $dir): void {
    global $root,$config;
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/bottom-menu.php';
    $config=['userprofkey'=>100,'nickname'=>'BottomOwner'];$_SERVER['REQUEST_METHOD']='POST';$_SESSION=['log'=>'BottomOwner','par'=>'test-password','token'=>'native-csrf'];$_POST=['uid'=>'native-csrf'];
}
function bottomNativeForm(array $s): array {
    $f=['version'=>motor_bottom_version($s),'operation'=>'save','enabled'=>$s['enabled']?'1':'0'];
    foreach($s['items'] as $i=>$item){$id=$item['id'];foreach(['label','target','icon'] as $key)$f[$key.'_'.$id]=$item[$key];$f['enabled_'.$id]=$item['enabled']?'1':'0';$f['position_'.$id]=(string)($i+1);}return $f;
}
if(($argv[1]??'')==='worker'){
    bottomNativeSetup($argv[2]);$f=bottomNativeForm(motor_bottom_defaults());$i=(int)$argv[3];$f['label_1']='Worker '.$i;$f['target_1']=$i%2?'chat':'gallery';$f['icon_1']=$i%2?'forum':'image';$f['enabled_4']=(string)($i%2);
    try{motor_bottom_save($f);echo 'saved';}catch(RuntimeException $e){if($e->getCode()!==409)throw $e;echo 'stale';}exit;
}
$dir=sys_get_temp_dir().'/motor-bottom-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);$processes=[];
try {
    bottomNativeSetup($dir);$p=array_fill(0,100,'0');$p[0]='BottomOwner';$p[1]=md5(md5('test-password'));$p[7]='101';$p[37]='0';$profile=implode(':||:',$p);file_put_contents($dir.'/profil/BottomOwner.prof',$profile);file_put_contents($dir.'/news.dat','unchanged news');file_put_contents($dir.'/home-settings.json','unchanged home settings');
    for($i=0;$i<8;$i++){$p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$i.'.log','w'],2=>['file',$dir.'/'.$i.'.err','w']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start menu worker');$processes[]=$p;}
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Menu worker failed');$processes=[];$saved=0;$stale=0;
    for($i=0;$i<8;$i++){if(file_get_contents($dir.'/'.$i.'.err')!=='')throw new RuntimeException('Menu worker warning');$v=file_get_contents($dir.'/'.$i.'.log');$saved+=($v==='saved');$stale+=($v==='stale');}
    if($saved!==1||$stale!==7)throw new RuntimeException('Lost menu version guard');
    $s=motor_bottom_settings();$items=array_column($s['items'],null,'id');$winner=(int)substr($items['1']['label'],7);
    if($items['1']['target']!==($winner%2?'chat':'gallery')||$items['1']['icon']!==($winner%2?'forum':'image')||$items['4']['enabled']!==(bool)($winner%2))throw new RuntimeException('Mixed concurrent menu fields');
    $old=bottomNativeForm($s);motor_bottom_save(['operation'=>'defaults','version'=>motor_bottom_version($s)]);
    if(motor_bottom_settings()['revision']==='initial')throw new RuntimeException('Reset reused initial revision');
    try{motor_bottom_save($old);throw new LogicException('Stale form accepted after reset');}catch(RuntimeException $e){if($e->getCode()!==409)throw $e;}
    if(file_get_contents($dir.'/profil/BottomOwner.prof')!==$profile||file_get_contents($dir.'/news.dat')!=='unchanged news'||file_get_contents($dir.'/home-settings.json')!=='unchanged home settings')throw new RuntimeException('Menu edit changed unrelated data');
    echo 'PASS: bottom menu, eight competing saves -> one complete menu and seven stale refusals; reset keeps revision guard; profile, news and homepage settings unchanged'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f)$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());rmdir($dir);
}
