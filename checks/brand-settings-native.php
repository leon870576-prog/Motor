<?php
$root='/var/www/html';
function brandNativeSetup(string $dir): void {
    global $root,$config;
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');
    require $root.'/includes/functions.php';require $root.'/includes/portal-brand.php';
    $config=['configkeys'=>140,'userprofkey'=>100,'nickname'=>'BrandOwner'];
    $_SERVER['REQUEST_METHOD']='POST';$_SESSION=['log'=>'BrandOwner','par'=>'test-password','token'=>'native-csrf'];$_POST=['uid'=>'native-csrf'];
}
if (($argv[1]??'')==='worker') {
    brandNativeSetup($argv[2]);
    try {motor_brand_save(['version'=>$argv[3],'title'=>'Portal '.$argv[4],'subtitle'=>'City '.$argv[4],'logo'=>'']);echo 'saved';}
    catch(RuntimeException $e){if($e->getCode()!==409)throw $e;echo 'stale';}exit;
}
if (($argv[1]??'')==='legacy') {brandNativeSetup($argv[2]);for($i=1;$i<=100;$i++)change_setting([17=>(string)$i]);exit;}
$dir=sys_get_temp_dir().'/motor-brand-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);$processes=[];
try {
    brandNativeSetup($dir);$p=array_fill(0,100,'0');$p[0]='BrandOwner';$p[1]=md5(md5('test-password'));$p[7]='101';$p[37]='0';$profile=implode(':||:',$p);file_put_contents($dir.'/profil/BrandOwner.prof',$profile);
    $fields=array_fill(0,140,'0');$fields[8]='BrandOwner';$fields[9]='owner@example.test';$fields[11]='Лесозаводск онлайн';$fields[12]='Приморский край · Россия';$fields[15]='assets/lesika/lesozavodsk.svg';$version=motor_brand_version($fields);file_put_contents($dir.'/config.dat',implode('|',$fields).'|');
    foreach(range(0,8) as $i){$p=proc_open([PHP_BINARY,__FILE__,$i===8?'legacy':'worker',$dir,$version,(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$i.'.log','w'],2=>['file',$dir.'/'.$i.'.err','w']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start branding worker');$processes[]=$p;}
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Branding worker failed');$processes=[];$saved=0;$stale=0;
    foreach(range(0,8) as $i){if(file_get_contents($dir.'/'.$i.'.err')!=='')throw new RuntimeException('Branding worker warning');$v=file_get_contents($dir.'/'.$i.'.log');$saved+=($v==='saved');$stale+=($v==='stale');}
    if($saved!==1||$stale!==7)throw new RuntimeException('Lost branding version guard');
    $actual=explode('|',file_get_contents($dir.'/config.dat'));
    if(count($actual)!==141||$actual[17]!=='100'||substr($actual[11],7)!==substr($actual[12],5))throw new RuntimeException('Lost or mixed settings');
    foreach($fields as $i=>$v)if(!in_array($i,[11,12,17],true)&&$actual[$i]!==$v)throw new RuntimeException('Unrelated settings changed');
    if(file_get_contents($dir.'/profil/BrandOwner.prof')!==$profile)throw new RuntimeException('Profile changed');
    echo 'PASS: branding settings, eight competing saves -> one complete name/subtitle/logo and seven stale refusals; 100 concurrent legacy updates retained; profile unchanged'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f)$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());rmdir($dir);
}
