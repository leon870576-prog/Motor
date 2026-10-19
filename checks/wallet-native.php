<?php
$root='/var/www/html';
if(($argv[1]??'')==='worker'){
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');require $root.'/includes/functions.php';require $root.'/includes/wallet.php';
    $config=['userprofkey'=>100,'karantin'=>0,'regkeys'=>0,'minkredit'=>10,'maxkredit'=>1000,'percentkredit'=>10,'avatarpay'=>5];$i=(int)$argv[3];$mode=$argv[4];
    for($n=0;$n<20;$n++){
        if($mode==='counter'){increment_profil('Receiver',[33=>1,36=>1,41=>1]);continue;}
        try{
            if($mode==='avatar'){motor_wallet_avatar('Receiver','images/avators2/1.gif',null,2000000000,md5('fixture'));continue;}
            if($mode==='credit'){motor_wallet_credit('Borrower','1','100','0',motor_wallet_credit_rules(),2000000000,md5('fixture'));continue;}
            $actor=$mode==='one'?'Single':($mode==='opposite'?($i%2?'OppositeA':'OppositeB'):'Sender'.$i);
            $target=$mode==='one'?'Target'.$i:($mode==='opposite'?($i%2?'OppositeB':'OppositeA'):'Receiver');
            motor_wallet_transfer($actor,$target,'25','0',2000000000,md5('fixture'));
        }catch(RuntimeException $e){if($mode!=='one' || $e->getCode()!==409)throw $e;}
    }exit;
}
$dir=sys_get_temp_dir().'/motor-wallet-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);mkdir($dir.'/dataavators',0700);$processes=[];
try{
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/wallet.php';
    $names=['Receiver','Single','OppositeA','OppositeB','Borrower'];for($i=0;$i<6;$i++){$names[]='Sender'.$i;$names[]='Target'.$i;}
    foreach($names as $name){$p=array_fill(0,100,'0');$p[0]=$name;$p[1]=md5('fixture');$p[4]='fixture@example.test';$p[6]='1';$p[36]='200';$p[41]='1000';$p[97]='comment-state';$p[98]='arc-state';$p[99]='game-state';file_put_contents($dir.'/profil/'.$name.'.prof',implode(':||:',$p).':||:');}
    foreach(['many','one','opposite','counter','credit','avatar'] as $mode)for($i=0;$i<6;$i++){
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i,$mode],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$mode.$i.'.log','a'],2=>['file',$dir.'/'.$mode.$i.'.log','a']],$pipes);
        if(!is_resource($p))throw new RuntimeException('Cannot start wallet worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Wallet worker failed');$processes=[];
    $read=fn($name)=>explode(':||:',file_get_contents($dir.'/profil/'.$name.'.prof'));
    $p=$read('Receiver');if((int)$p[41]!==1265 || (int)$p[33]!==120 || (int)$p[36]!==320)throw new RuntimeException('Lost transfer or concurrent comment reward');
    foreach($names as $name){$p=$read($name);if($p[97]!=='comment-state' || $p[98]!=='arc-state' || $p[99]!=='game-state')throw new RuntimeException('Lost unrelated profile state');}
    for($i=0;$i<6;$i++)if((int)$read('Sender'.$i)[41]!==975)throw new RuntimeException('Duplicate debit');
    $sum=0;for($i=0;$i<6;$i++)$sum+=(int)$read('Target'.$i)[41];if($sum!==6025 || (int)$read('Single')[41]!==975)throw new RuntimeException('Single revision transferred more than once');
    foreach(['OppositeA','OppositeB'] as $name)if((int)$read($name)[41]!==1000)throw new RuntimeException('Opposing transfers failed');
    $p=$read('Borrower');if((int)$p[41]!==1100 || (int)$p[54]!==110 || motor_wallet_state($p)['revision']!==1)throw new RuntimeException('Duplicate borrowing');
    foreach(glob($dir.'/*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Wallet worker emitted warning: '.file_get_contents($log));
    echo 'PASS: wallet, 36 concurrent workers, duplicate/opposing transfers, single-revision competing targets, duplicate loans, one avatar purchase and 120 comment rewards; balances and fields 97/98/99 preserved'.PHP_EOL;
}finally{
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
