<?php
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');
    require $root.'/includes/functions.php';require $root.'/includes/reputation.php';
    $config=['userprofkey'=>100,'karantin'=>0,'regkeys'=>0];$i=(int)$argv[3];$mode=$argv[4];
    for ($n=0;$n<20;$n++) {
        if ($mode==='counter') {increment_profil('NewUser',[12=>1,41=>2]);continue;}
        $actor=$mode==='edit'?'Editor':($mode==='one'?'SingleVoter':($mode==='opposite'?($i%2?'OppositeA':'OppositeB'):'Voter'.$i));
        $target=$mode==='one'?'Target'.$i:($mode==='opposite'?($i%2?'OppositeB':'OppositeA'):'NewUser');
        $vote=$mode==='one'?'plus':($mode==='edit' || $n%2?'minus':'plus');
        try {motor_reputation_vote($actor,$target,$vote,1750000000,md5('fixture'),$mode==='edit'?$argv[5]:null);}
        catch (RuntimeException $e) {if (!in_array($e->getCode(),[429,409],true)) throw $e;}
    }
    exit;
}
$dir=sys_get_temp_dir().'/motor-reputation-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);mkdir($dir.'/dataraiting',0700);$processes=[];
try {
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/reputation.php';
    $names=['NewUser','SingleVoter','OppositeA','OppositeB','Editor'];for($i=0;$i<6;$i++){$names[]='Voter'.$i;$names[]='Target'.$i;}
    foreach($names as $name){$p=array_fill(0,100,'0');$p[0]=$name;$p[1]=md5('fixture');$p[4]='fixture@example.test';$p[6]='1';$p[36]=$name==='NewUser'?'0':'200';$p[41]='100';$p[96]='wallet-state';$p[97]='comment-state';$p[98]='arc-state';$p[99]='game-state';file_put_contents($dir.'/profil/'.$name.'.prof',implode(':||:',$p).':||:');}
    $config=['userprofkey'=>100,'karantin'=>0,'regkeys'=>0];motor_reputation_vote('Editor','NewUser','plus',1750000000,md5('fixture'),'none');$revision=motor_reputation_read('Editor')['NewUser']['revision'];
    foreach(['many','one','opposite','counter','edit'] as $mode)for($i=0;$i<6;$i++){
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i,$mode,$revision],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$mode.$i.'.log','a'],2=>['file',$dir.'/'.$mode.$i.'.log','a']],$pipes);
        if(!is_resource($p))throw new RuntimeException('Cannot start reputation worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Reputation worker failed');$processes=[];
    $read=fn($name)=>explode(':||:',file_get_contents($dir.'/profil/'.$name.'.prof'));
    $p=$read('NewUser');if((int)$p[49]!==-7 || (int)$p[50]!==0 || (int)$p[51]!==7 || (int)$p[12]!==120 || (int)$p[41]!==340 || $p[96]!=='wallet-state' || $p[97]!=='comment-state' || $p[98]!=='arc-state' || $p[99]!=='game-state')throw new RuntimeException('Lost/duplicated votes, edits or unrelated profile updates');
    $sum=0;for($i=0;$i<6;$i++)$sum+=(int)$read('Target'.$i)[49];if($sum!==1)throw new RuntimeException('One voter credited multiple targets');
    foreach(['OppositeA','OppositeB'] as $name)if((int)$read($name)[49]!==-1 || (int)$read($name)[50]!==0 || (int)$read($name)[51]!==1)throw new RuntimeException('Opposing votes failed');
    foreach(array_merge(['Editor'],array_map(fn($i)=>'Voter'.$i,range(0,5))) as $name)if(motor_reputation_read($name)['NewUser']['sign']!==-1 || (int)$read($name)[48]!==1750010800)throw new RuntimeException('History or cooldown changed incorrectly');
    try {motor_reputation_vote('Editor','NewUser','plus',1750000000,md5('fixture'),'none');throw new RuntimeException('Stale first-vote retry accepted');} catch(RuntimeException $e){if($e->getCode()!==409)throw $e;}
    foreach(glob($dir.'/*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Reputation worker emitted warning');
    echo 'PASS: reputation editing, 30 concurrent workers, 480 vote/change attempts -> exactly 10 current votes, 120 concurrent profile updates; flips, stale retries, counters, cooldown and wallet/comment/game state preserved; no deadlocks'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
