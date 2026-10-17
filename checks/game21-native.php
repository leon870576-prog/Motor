<?php
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');require $root.'/includes/functions.php';require $root.'/includes/game21.php';$config=['userprofkey'=>100];
    for($i=0;$i<15;$i++){
        $r=motor21_apply('CardTest',$argv[3],$argv[4],'10',100);
        if(!in_array($r['code'],[200,409],true))throw new RuntimeException('Unexpected game response');
        increment_profil('CardTest',[12=>1]);
    }
    exit;
}
$dir=sys_get_temp_dir().'/motor-game21-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil');$processes=[];
try {
    foreach(['start','stand'] as $command){
        $d=array_fill(0,100,'0');$d[0]='CardTest';$d[1]='test-hash';$d[4]='test@example.invalid';$d[41]='100';
        $revision='0';
        if($command==='stand'){
            $revision=str_repeat('a',32);$player=[17,33];$dealer=[13,14];
            $state=['v'=>1,'revision'=>$revision,'rounds'=>0,'wins'=>0,'legacy'=>[],'game'=>['bet'=>10,'status'=>'playing','player'=>$player,'dealer'=>$dealer,'deck'=>array_values(array_diff(range(1,36),$player,$dealer))]];
            $d[99]='g21:'.json_encode($state);$d[41]='90';
        }
        file_put_contents($dir.'/profil/CardTest.prof',implode(':||:',$d).':||:');
        for($i=0;$i<6;$i++){
            $pipes=[];$p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,$command,$revision],[0=>['file','/dev/null','r'],1=>['file',$dir.'/worker-'.$i.'.log','a'],2=>['file',$dir.'/worker-'.$i.'.log','a']],$pipes);
            if(!is_resource($p))throw new RuntimeException('Cannot start game worker');$processes[]=$p;
        }
        foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Game worker failed');$processes=[];
        $d=explode(':||:',file_get_contents($dir.'/profil/CardTest.prof'));$state=json_decode(substr($d[99],4),true);
        $balance=$command==='stand'?110:90+($state['game']['status']==='won'?20:0);
        if((int)$d[41]!==$balance || (int)$d[12]!==90 || $d[1]!=='test-hash' || $d[4]!=='test@example.invalid')throw new RuntimeException('Game concurrent balance/profile mismatch');
        if($command==='stand' && ($state['rounds']!==1 || $state['wins']!==1))throw new RuntimeException('Duplicate settlement');
        foreach(glob($dir.'/worker-*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Game worker warning: '.file_get_contents($log));
    }
    echo 'PASS: native game21, six parallel workers, 180 repeated game actions and 180 profile increments; stake and payout applied once'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
