<?php
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');require $root.'/includes/functions.php';
    $config=['configkeys'=>140];$i=(int)$argv[3];
    for($n=1;$n<=50;$n++)change_setting([100+$i=>(string)$n]);
    exit;
}
$dir=sys_get_temp_dir().'/motor-settings-'.bin2hex(random_bytes(8));mkdir($dir,0700);$processes=[];
try {
    $data=array_fill(0,140,'0');$data[8]='Owner';$data[9]='test@example.test';file_put_contents($dir.'/config.dat',implode('|',$data).'|');
    for($i=0;$i<12;$i++){
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$i.'.log','a'],2=>['file',$dir.'/'.$i.'.log','a']],$pipes);
        if(!is_resource($p))throw new RuntimeException('Cannot start settings worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Settings worker failed');$processes=[];
    $data=explode('|',file_get_contents($dir.'/config.dat'));
    for($i=0;$i<12;$i++)if($data[100+$i]!=='50')throw new RuntimeException('Lost concurrent setting');
    if($data[8]!=='Owner' || $data[9]!=='test@example.test' || count($data)!==141)throw new RuntimeException('Unrelated config changed');
    foreach(glob($dir.'/*.log') as $p)if(trim(file_get_contents($p))!=='')throw new RuntimeException('Settings worker emitted warning');
    echo 'PASS: legacy settings, 12 workers / 600 saves; all independent fields preserved, configuration complete'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(glob($dir.'/*') as $f)unlink($f);rmdir($dir);
}
