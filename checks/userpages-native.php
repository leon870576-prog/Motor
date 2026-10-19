<?php
// Build-only test. All data lives in a temporary directory, never /data/local.
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');
    require $root.'/includes/functions.php';require $root.'/includes/userpages.php';
    $config=['floodstime'=>5,'karantin'=>0,'regkeys'=>0];$actor='Writer'.$argv[3];
    for ($i=0;$i<10;$i++) {
        $id=md5($actor.':'.$i);$input=['id'=>$id,'msg'=>'Parallel review '.$actor.' '.$i];
        motor_userpage_apply('PageOwner',$actor,false,'guest_add',$input,1750000000+$i*10);
        motor_userpage_apply('PageOwner',$actor,false,'guest_add',$input,1750000000+$i*10);
    }
    exit;
}
$dir=sys_get_temp_dir().'/motor-userpages-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);$processes=[];
try {
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');
    require $root.'/includes/functions.php';require $root.'/includes/userpages.php';
    $config=['floodstime'=>5,'karantin'=>0,'regkeys'=>0];
    foreach (['PageOwner','Writer0','Writer1','Writer2','Writer3','Writer4','Writer5'] as $name) {
        $p=array_fill(0,100,'0');$p[0]=$name;$p[6]='1';$p[25]='1';$p[49]='17';
        file_put_contents($dir.'/profil/'.$name.'.prof',implode(':||:',$p));
    }
    $profileHash=hash_file('sha256',$dir.'/profil/PageOwner.prof');
    motor_userpage_apply('PageOwner','PageOwner',false,'save',['revision'=>'0','title'=>'Concurrent page','about'=>'','published'=>'1','guestbook_open'=>'1'],1740000000);
    for ($i=0;$i<6;$i++) {
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/worker-'.$i.'.log','a'],2=>['file',$dir.'/worker-'.$i.'.log','a']],$pipes);
        if (!is_resource($p)) throw new RuntimeException('Cannot start userpage worker');$processes[]=$p;
    }
    foreach ($processes as $p) if (proc_close($p)!==0) throw new RuntimeException('Userpage worker failed');$processes=[];
    $data=motor_userpage_read('PageOwner');
    if (count($data['guestbook'])!==60 || $data['revision']!==61 || count(array_unique(array_column($data['guestbook'],'id')))!==60) throw new RuntimeException('Lost or duplicated concurrent reviews');
    if ($profileHash!==hash_file('sha256',$dir.'/profil/PageOwner.prof')) throw new RuntimeException('Profile/authority unexpectedly changed');
    foreach (glob($dir.'/worker-*.log') as $log) if (trim(file_get_contents($log))!=='') throw new RuntimeException('Userpage worker emitted a warning');
    echo 'PASS: personal pages, six workers, 120 submissions, exactly 60 reviews, no lost updates or profile changes'.PHP_EOL;
} finally {
    foreach ($processes as $p) if (is_resource($p)) {proc_terminate($p);proc_close($p);}
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f) {$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
