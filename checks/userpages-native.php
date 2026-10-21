<?php
// Build-only test. All data lives in a temporary directory, never /data/local.
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');
    require $root.'/includes/functions.php';require $root.'/includes/userpages.php';
    $config=['floodstime'=>5,'karantin'=>0,'regkeys'=>0];$actor='Writer'.$argv[3];
    if (($argv[4]??'')==='settings') {
        $i=(int)$argv[3]+1;
        try {motor_userpage_apply('PageOwner','PageOwner',false,'save',['revision'=>'61','title'=>'Settings '.$i,'about'=>'','published'=>'1','guestbook_open'=>'1','news_per_page'=>(string)$i,'photos_per_page'=>(string)($i+1),'reviews_per_page'=>(string)($i+2)],1750010000);echo 'saved';}
        catch (RuntimeException $e) {if($e->getCode()!==409)throw $e;echo 'stale';}
        exit;
    }
    if (($argv[4]??'')==='administration') {
        $i=(int)$argv[3];$action=['save','reset_settings','clear_page'][$i%3];
        try {motor_userpage_apply('PageOwner','Manager'.($i%2),true,$action,['revision'=>'62','confirm'=>'1','title'=>'Admin settings','about'=>'','published'=>'1','guestbook_open'=>'1','news_per_page'=>'7','photos_per_page'=>'8','reviews_per_page'=>'9'],1750020000);echo 'saved';}
        catch (RuntimeException $e) {if($e->getCode()!==409)throw $e;echo 'stale';}
        exit;
    }
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
        $p=array_fill(0,100,'0');$p[0]=$name;$p[1]='fixture';$p[4]='fixture@example.test';$p[6]='1';$p[25]='1';$p[49]='17';
        file_put_contents($dir.'/profil/'.$name.'.prof',implode(':||:',$p));
    }
    $profileHash=hash_file('sha256',$dir.'/profil/PageOwner.prof');
    motor_userpage_apply('PageOwner','PageOwner',false,'save',['revision'=>'0','title'=>'Concurrent page','about'=>'','published'=>'1','guestbook_open'=>'1','news_per_page'=>'2','photos_per_page'=>'3','reviews_per_page'=>'4'],1740000000);
    for ($i=0;$i<6;$i++) {
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i],[0=>['file','/dev/null','r'],1=>['file',$dir.'/worker-'.$i.'.log','a'],2=>['file',$dir.'/worker-'.$i.'.log','a']],$pipes);
        if (!is_resource($p)) throw new RuntimeException('Cannot start userpage worker');$processes[]=$p;
    }
    foreach ($processes as $p) if (proc_close($p)!==0) throw new RuntimeException('Userpage worker failed');$processes=[];
    $data=motor_userpage_read('PageOwner');
    if (count($data['guestbook'])!==60 || $data['revision']!==61 || count(array_unique(array_column($data['guestbook'],'id')))!==60) throw new RuntimeException('Lost or duplicated concurrent reviews');
    if (motor_userpage_sizes($data)!==['news'=>2,'photos'=>3,'reviews'=>4]) throw new RuntimeException('Review updates lost page sizes');
    if ($profileHash!==hash_file('sha256',$dir.'/profil/PageOwner.prof')) throw new RuntimeException('Profile/authority unexpectedly changed');
    for($i=0;$i<6;$i++) {$p=explode(':||:',file_get_contents($dir.'/profil/Writer'.$i.'.prof'));foreach([33,36,41] as $field) if ((int)$p[$field]!==10) throw new RuntimeException('Review activity not synchronized');}
    foreach (glob($dir.'/worker-*.log') as $log) if (trim(file_get_contents($log))!=='') throw new RuntimeException('Userpage worker emitted a warning');
    for ($i=0;$i<8;$i++) {
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i,'settings'],[0=>['file','/dev/null','r'],1=>['file',$dir.'/settings-'.$i.'.log','w'],2=>['file',$dir.'/settings-'.$i.'.err','w']],$pipes);
        if(!is_resource($p))throw new RuntimeException('Cannot start settings worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Settings worker failed');$processes=[];$saved=0;$stale=0;
    for($i=0;$i<8;$i++){if(file_get_contents($dir.'/settings-'.$i.'.err')!=='')throw new RuntimeException('Settings warning');$v=file_get_contents($dir.'/settings-'.$i.'.log');$saved+=($v==='saved');$stale+=($v==='stale');}
    $next=motor_userpage_read('PageOwner');$winner=(int)substr($next['title'],9);
    if($saved!==1||$stale!==7||$next['revision']!==62||motor_userpage_sizes($next)!==['news'=>$winner,'photos'=>$winner+1,'reviews'=>$winner+2]||$next['guestbook']!==$data['guestbook']||$next['review_totals']!==$data['review_totals'])throw new RuntimeException('Concurrent settings mixed fields or lost reviews');
    if($profileHash!==hash_file('sha256',$dir.'/profil/PageOwner.prof'))throw new RuntimeException('Settings changed owner profile');
    echo 'PASS: personal page sizes, eight competing settings saves -> one complete set and seven stale refusals; sizes survive concurrent reviews, counts/rewards/content preserved'.PHP_EOL;
    echo 'PASS: personal pages, six workers, 120 submissions, exactly 60 reviews, exact review counts/points/coins, unchanged owner authority'.PHP_EOL;
    for($i=0;$i<3;$i++){$p=explode(':||:',file_get_contents($dir.'/profil/PageOwner.prof'));$p[0]='Manager'.$i;$p[7]=(string)(101+$i);file_put_contents($dir.'/profil/Manager'.$i.'.prof',implode(':||:',$p));}
    try {motor_userpage_apply('PageOwner','Manager2',true,'clear_page',['revision'=>'62','confirm'=>'1'],1750020000);throw new Exception('Moderator acquired admin powers');} catch(RuntimeException $e){if($e->getCode()!==403)throw $e;}
    for($i=0;$i<8;$i++){$p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i,'administration'],[0=>['file','/dev/null','r'],1=>['file',$dir.'/admin-'.$i.'.log','w'],2=>['file',$dir.'/admin-'.$i.'.err','w']],$pipes);if(!is_resource($p))throw new RuntimeException('Cannot start admin worker');$processes[]=$p;}
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Admin worker failed');$processes=[];$saved=0;$stale=0;
    for($i=0;$i<8;$i++){if(file_get_contents($dir.'/admin-'.$i.'.err')!=='')throw new RuntimeException('Admin warning');$v=file_get_contents($dir.'/admin-'.$i.'.log');$saved+=($v==='saved');$stale+=($v==='stale');}
    $last=motor_userpage_read('PageOwner');$action=$last['audit'][array_key_last($last['audit'])]['action'];
    if($saved!==1||$stale!==7||$last['revision']!==63||$last['review_totals']!==$next['review_totals']||$last['recent']!==$next['recent']||$profileHash!==hash_file('sha256',$dir.'/profil/PageOwner.prof'))throw new RuntimeException('Admin race lost data or revived stale settings');
    if(count($last['guestbook'])!==($action==='clear_page'?0:60))throw new RuntimeException('Admin clear was not atomic');
    if($action==='save'?(motor_userpage_sizes($last)!==['news'=>7,'photos'=>8,'reviews'=>9]):(isset($last['page_sizes'])||$last['published']||$last['title']!==''))throw new RuntimeException('Admin action mixed fields');
    require $root.'/includes/profile-phone.php';
    foreach(['+82 10-1234-5678','001234567890','+12345678901234567890',''] as $phone)if(motor_profile_phone($phone)!==$phone)throw new RuntimeException('Phone lost prefix or digits');
    foreach(['12',str_repeat('9',21),"12345\n6789",'<script>123456</script>',[]] as $phone){try{motor_profile_phone($phone);throw new Exception('Bad phone accepted');}catch(RuntimeException $e){if($e->getCode()!==400)throw $e;}}
    echo 'PASS: personal page administration, eight competing save/reset/clear actions -> one atomic update, seven stale refusals; role boundary, cumulative counts, replay receipts and profile intact; phone prefix and 20 digits preserved'.PHP_EOL;
} finally {
    foreach ($processes as $p) if (is_resource($p)) {proc_terminate($p);proc_close($p);}
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f) {$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
