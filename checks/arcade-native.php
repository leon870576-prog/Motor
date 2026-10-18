<?php
$root='/var/www/html';
if(($argv[1]??'')==='worker'){
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');require $root.'/includes/functions.php';require $root.'/includes/arcade.php';require $root.'/includes/game21.php';$config=['userprofkey'=>100];
    $mode=$argv[3];$version=motor_arcade_version(motor_arcade_settings());
    for($i=0;$i<30;$i++){
        if($mode==='21'){$s=motor21_snapshot('ArcTest')['state'];$r=motor21_apply('ArcTest',($s['game']['status']??'')==='playing'?'stand':'start',$s['revision'],'10',100,null,$version);}
        elseif($mode!=='counter'){$revision=($argv[4]??'')==='repeat'?'0':motor_arcade_snapshot('ArcTest')['state']['revision'];$r=motor_arcade_apply('ArcTest',$mode,$revision,$version,'2');}
        if(isset($r)&&!in_array($r['code'],[200,409],true))throw new RuntimeException('Unexpected concurrent response');
        increment_profil('ArcTest',[12=>1,41=>1]);
    }
    exit;
}
$dir=sys_get_temp_dir().'/motor-arcade-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil');$processes=[];
define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/arcade.php';require $root.'/includes/game21.php';$config=['userprofkey'=>100];
function workers(array $modes,string $repeat=''): void {
    global $dir,$processes;
    foreach($modes as $i=>$mode){$pipes=[];$p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,$mode,$repeat],[0=>['file','/dev/null','r'],1=>['file',$dir.'/worker-'.$i.'.log','a'],2=>['file',$dir.'/worker-'.$i.'.log','a']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start arcade worker');$processes[]=$p;}
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Arcade worker failed');$processes=[];
    foreach(glob($dir.'/worker-*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Arcade warning: '.file_get_contents($log));
}
try{
    $settings=motor_arcade_defaults();foreach($settings as &$p){$p['mode']='percent';$p['percent']=100;}unset($p);file_put_contents($dir.'/arcade-settings.json',json_encode($settings));
    $base=array_fill(0,100,'0');$base[0]='ArcTest';$base[1]='test-hash';$base[4]='test@example.invalid';$base[41]='10000';
    foreach(['bandit','kosti','naperstki'] as $id){
        file_put_contents($dir.'/profil/ArcTest.prof',implode(':||:',$base).':||:');workers(array_fill(0,6,$id),'repeat');
        $d=reading_profil('ArcTest');$g=motor_arcade_decode($d[98])['games'][$id];
        if($g['rounds']!==1||$g['wins']!==1||(int)$d[12]!==180||(int)$d[41]!==10000+180-$g['cost']+$g['payout'])throw new RuntimeException('Duplicate game charged or lost increment');
    }
    file_put_contents($dir.'/profil/ArcTest.prof',implode(':||:',$base).':||:');workers(['kosti','kosti','naperstki','naperstki','21','counter']);
    $d=reading_profil('ArcTest');$a=motor_arcade_decode($d[98]);$b=motor21_decode($d[99]);
    $expected=10000+180+($a['games']['kosti']['rounds']??0)*10+($a['games']['naperstki']['rounds']??0)*100+$b['rounds']*10-(($b['game']['status']??'')==='playing'?10:0);
    if((int)$d[41]!==$expected||(int)$d[12]!==180||$d[1]!=='test-hash'||$d[4]!=='test@example.invalid')throw new RuntimeException('Cross-game balance mismatch');
    echo 'PASS: native arcade, six concurrent processes; replay protection in all three games; cross-game 21/dice/cups plus 180 balance/counter increments preserved'.PHP_EOL;
    foreach(['bandit','kosti','naperstki'] as $id){
        $policy=['mode'=>'percent','percent'=>37,'cost'=>5];$wins=0;
        for($i=0;$i<6000;$i++){$r=motor_arcade_round($id,$policy,2);$wins+=(int)($r['status']==='won');if(($r['payout']>$r['cost'])!==($r['status']==='won'))throw new RuntimeException('Wrong win classification');}
        $ratio=$wins/60;if(abs($ratio-37)>4)throw new RuntimeException('Probability sample outside tolerance');
        echo 'PASS: native '.$id.' configured 37%, 6000 rounds, observed '.round($ratio,2).'%'.PHP_EOL;
    }
}finally{
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
