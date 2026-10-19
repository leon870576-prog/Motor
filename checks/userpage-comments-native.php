<?php
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');require $root.'/includes/functions.php';require $root.'/includes/userpages.php';
    $config=['userprofkey'=>100,'karantin'=>0,'regkeys'=>0,'floodstime'=>5];$actor='Writer'.$argv[3];
    if (($argv[4]??'')==='counter') {for($i=0;$i<40;$i++)increment_profil($actor,[33=>1,12=>1]);exit;}
    for($i=0;$i<10;$i++)foreach(['OwnerA','OwnerB'] as $owner){
        $input=['post'=>md5($owner),'id'=>md5($actor.':'.$owner.':'.$i),'msg'=>'Concurrent comment '.$i];
        motor_userpage_apply($owner,$actor,false,'comment_add',$input,1750000000+$i*10);
        motor_userpage_apply($owner,$actor,false,'comment_add',$input,1750000000+$i*10);
    }
    exit;
}
$dir=sys_get_temp_dir().'/motor-page-comments-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);$processes=[];
try {
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/userpages.php';
    $config=['userprofkey'=>100,'karantin'=>0,'regkeys'=>0,'floodstime'=>5];
    foreach(['OwnerA','OwnerB','Writer0','Writer1','Writer2','Writer3','Writer4','Writer5'] as $name){$p=array_fill(0,100,'0');$p[0]=$name;$p[1]='fixture';$p[4]='fixture@example.test';$p[6]='1';$p[33]='7';$p[49]='17';$p[98]='arc-state';$p[99]='game-state';file_put_contents($dir.'/profil/'.$name.'.prof',implode(':||:',$p).':||:');}
    foreach(['OwnerA','OwnerB'] as $owner){motor_userpage_apply($owner,$owner,false,'save',['revision'=>'0','title'=>'News','about'=>'','published'=>'1','guestbook_open'=>'1'],1740000000);motor_userpage_apply($owner,$owner,false,'news_add',['id'=>md5($owner),'title'=>'News','msg'=>'Test'],1740000010);}
    foreach(['comments','counter'] as $mode)for($i=0;$i<6;$i++){
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i,$mode],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$mode.$i.'.log','a'],2=>['file',$dir.'/'.$mode.$i.'.log','a']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start comments worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Comments worker failed');$processes=[];
    foreach(['OwnerA','OwnerB'] as $owner){$d=motor_userpage_read($owner);if(count($d['news'][0]['comments'])!==60 || $d['revision']!==62)throw new RuntimeException('Lost or duplicate comments');}
    for($i=0;$i<6;$i++){$p=explode(':||:',file_get_contents($dir.'/profil/Writer'.$i.'.prof'));$receipts=motor_userpage_comment_receipts($p[97]);if((int)$p[33]!==67 || (int)$p[12]!==40 || $p[98]!=='arc-state' || $p[99]!=='game-state' || $receipts!==['OwnerA'=>10,'OwnerB'=>10])throw new RuntimeException('Lost or double-counted profile activity');}
    if(motor_userpage_public_comment_count()!==120)throw new RuntimeException('Incorrect global count');
    foreach(glob($dir.'/*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Comments worker emitted a warning');
    echo 'PASS: personal-news comments, 12 workers, 240 submissions -> 120 comments; 240 simultaneous legacy increments retained; exact profile/page counters and game fields'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
