<?php
$root='/var/www/html';
function templateNativeSetup(string $dir): void {
    global $root,$config;
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');
    require $root.'/includes/functions.php';require $root.'/includes/home-template.php';
    $config=['userprofkey'=>100,'nickname'=>'TemplateOwner'];
    $_SERVER['REQUEST_METHOD']='POST';$_SESSION=['log'=>'TemplateOwner','par'=>'test-password','token'=>'native-csrf'];$_POST=['uid'=>'native-csrf'];
}
if (($argv[1]??'')==='worker') {
    templateNativeSetup($argv[2]);
    $text=file_get_contents($root.'/includes/lesika/home.php')."\n// Writer ".$argv[4]."\n";
    try {motor_home_template_save(['version'=>$argv[3],'operation'=>'save','msg'=>$text]);echo 'saved';}
    catch(RuntimeException $e){if($e->getCode()!==409)throw $e;echo 'stale';}exit;
}
$dir=sys_get_temp_dir().'/motor-template-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);mkdir($dir.'/datamain',0700);$processes=[];
try {
    templateNativeSetup($dir);
    $p=array_fill(0,100,'0');$p[0]='TemplateOwner';$p[1]=md5(md5('test-password'));$p[4]='native@example.test';$p[7]='101';$p[37]='0';$profile=implode(':||:',$p);file_put_contents($dir.'/profil/TemplateOwner.prof',$profile);
    $seed=file_get_contents('/opt/motor-seed/local/datamain/index.dat');file_put_contents($dir.'/datamain/index.dat',$seed);
    file_put_contents($dir.'/home-settings.json','unchanged selections');file_put_contents($dir.'/news.dat','unchanged news');
    $initial=motor_home_template_state();
    if ($initial['contents']!==file_get_contents($root.'/includes/lesika/home.php')) throw new RuntimeException('Editor did not resolve the actual modern template');
    for($i=0;$i<8;$i++) {
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,$initial['version'],(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$i.'.log','w'],2=>['file',$dir.'/'.$i.'.err','w']],$pipes);
        if(!is_resource($p))throw new RuntimeException('Cannot start template worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Template worker failed');$processes=[];$saved=0;$stale=0;
    for($i=0;$i<8;$i++){if(file_get_contents($dir.'/'.$i.'.err')!=='')throw new RuntimeException('Template worker warning');$v=file_get_contents($dir.'/'.$i.'.log');$saved+=($v==='saved');$stale+=($v==='stale');}
    if($saved!==1||$stale!==7)throw new RuntimeException('Concurrent template writers lost the version guard');
    $state=motor_home_template_state();token_get_all($state['contents'],TOKEN_PARSE);
    $backup=$dir.'/home-template-backups/'.hash('sha256',$seed).'.dat';
    if(file_get_contents($backup)!==$seed||(fileperms($backup)&0777)!==0600)throw new RuntimeException('Original backup not preserved privately');
    try{motor_home_template_save(['version'=>$state['version'],'msg'=>'<?php if (']);throw new LogicException('Invalid PHP accepted');}catch(InvalidArgumentException $expected){}
    if(motor_home_template_state()['contents']!==$state['contents'])throw new RuntimeException('Invalid PHP changed template');
    motor_home_template_save(['version'=>$state['version'],'operation'=>'standard']);
    if(motor_home_template_state()['contents']!==$initial['contents'])throw new RuntimeException('Standard reset differs from actual template');
    if(file_get_contents($dir.'/profil/TemplateOwner.prof')!==$profile||file_get_contents($dir.'/home-settings.json')!=='unchanged selections'||file_get_contents($dir.'/news.dat')!=='unchanged news')throw new RuntimeException('Template edit changed unrelated data');
    echo 'PASS: homepage template editor, eight concurrent saves -> one complete template and seven stale refusals; exact private backup, PHP syntax rejection, standard reset, unchanged settings/news/profile'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f)$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());rmdir($dir);
}
