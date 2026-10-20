<?php
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');require $root.'/includes/functions.php';require $root.'/includes/userpages.php';$config=['userprofkey'=>100];
    if ($argv[3]==='migrate') motor_userpage_activity_migrate($argv[2].'/backups');
    else for($i=0;$i<40;$i++) increment_profil('OldUser',motor_comment_activity_deltas(1));
    exit;
}
$dir=sys_get_temp_dir().'/motor-activity-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/profil',0700);mkdir($dir.'/userpages',0700);$processes=[];
try {
    define('BASEDIR',$root.'/');define('DATADIR',$dir.'/');require $root.'/includes/functions.php';require $root.'/includes/userpages.php';$config=['userprofkey'=>100];
    foreach(['OldPage','OldUser'] as $name){$p=array_fill(0,100,'0');$p[0]=$name;$p[1]='fixture';$p[4]='fixture@example.test';$p[33]='10';$p[36]='20';$p[41]='30';$p[49]='17';$p[98]='arc-state';$p[99]='game-state';if($name==='OldUser')$p[97]='upc1:{"OldPage":3}';file_put_contents($dir.'/profil/'.$name.'.prof',implode(':||:',$p));}
    $d=motor_userpage_default('OldPage');$d['created']=1;$d['comment_totals']=['OldUser'=>3];
    foreach([1,2] as $i)$d['guestbook'][]=['id'=>md5((string)$i),'author'=>'OldUser','text'=>'Review','created'=>1,'updated'=>1,'revision'=>1];
    foreach([1,3] as $i)$d['recent'][]=['id'=>md5((string)$i),'actor'=>'OldUser','kind'=>'guest_add','hash'=>str_repeat('a',64),'time'=>1];
    file_put_contents($dir.'/userpages/OldPage.json',json_encode($d));$pageBefore=file_get_contents($dir.'/userpages/OldPage.json');
    foreach(['migrate','counter'] as $mode)for($i=0;$i<4;$i++){
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,$mode],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$mode.$i.'.log','a'],2=>['file',$dir.'/'.$mode.$i.'.log','a']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start activity worker');$processes[]=$p;
    }
    foreach($processes as $i=>$p) { $exit=proc_close($p);unset($processes[$i]);if($exit!==0){$details='';foreach(glob($dir.'/*.log') as $log)$details.=basename($log).': '.file_get_contents($log);throw new RuntimeException('Activity worker failed: '.$details);}}$processes=[];
    $p=motor_userpage_profile('OldUser');
    if((int)$p[33]!==173 || (int)$p[36]!==186 || (int)$p[41]!==196 || (int)$p[49]!==17 || $p[98]!=='arc-state' || $p[99]!=='game-state')throw new RuntimeException('Lost or duplicated activity');
    $r=motor_userpage_activity_receipts($p[97]);if($r!==['news'=>['OldPage'=>3],'rewards'=>['OldPage'=>3],'reviews'=>['OldPage'=>3]])throw new RuntimeException('Invalid receipts');
    if(file_get_contents($dir.'/backups/userpages/OldPage.json')!==$pageBefore)throw new RuntimeException('Original page backup missing');
    $backupHash=hash_file('sha256',$dir.'/backups/profil/OldUser.prof');$profileHash=hash_file('sha256',$dir.'/profil/OldUser.prof');
    $r=motor_userpage_activity_migrate($dir.'/backups');if($r['pages']!==0 || $r['profile_updates']!==0 || hash_file('sha256',$dir.'/profil/OldUser.prof')!==$profileHash || hash_file('sha256',$dir.'/backups/profil/OldUser.prof')!==$backupHash)throw new RuntimeException('Migration replay changed data');
    foreach(glob($dir.'/*.log') as $log)if(trim(file_get_contents($log))!=='')throw new RuntimeException('Activity worker warning');
    echo 'PASS: comment activity backfill, 8 workers; four concurrent migrations +160 legacy increments; exact counts/points/coins, immutable backups, unchanged authority/game fields'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
