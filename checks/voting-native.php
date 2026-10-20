<?php
$root='/var/www/html';
if (($argv[1]??'')==='worker') {
    define('BASEDIR',$root.'/');define('DATADIR',$argv[2].'/');define('SITETIME',1750000000);
    require $root.'/includes/functions.php';require $root.'/includes/voting.php';
    $i=(int)$argv[3];$revision=$argv[4];
    for($n=0;$n<10;$n++) motor_votes_submit('Voter'.($i%8),1+$i%3,$revision);
    exit;
}
$dir=sys_get_temp_dir().'/motor-voting-'.bin2hex(random_bytes(8));mkdir($dir,0700);mkdir($dir.'/datavotes',0700);$processes=[];
try {
    $question='Test|One|Two|Three||||||||';
    file_put_contents($dir.'/datavotes/votes.dat',$question);file_put_contents($dir.'/datavotes/result.dat','|0|0|0|0|0|0|0|0|0|0|');file_put_contents($dir.'/datavotes/users.dat','');
    $revision=hash('sha256',"\n".$question);
    for($i=0;$i<24;$i++){
        $p=proc_open([PHP_BINARY,__FILE__,'worker',$dir,(string)$i,$revision],[0=>['file','/dev/null','r'],1=>['file',$dir.'/'.$i.'.log','a'],2=>['file',$dir.'/'.$i.'.log','a']],$pipes);
        if (!is_resource($p)) throw new RuntimeException('Cannot start voting worker');$processes[]=$p;
    }
    foreach($processes as $p)if(proc_close($p)!==0)throw new RuntimeException('Voting worker failed');$processes=[];
    $totals=explode('|',file_get_contents($dir.'/datavotes/result.dat'));$users=file($dir.'/datavotes/users.dat',FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);
    if(array_sum(array_map('intval',$totals))!==8 || count($users)!==8 || count(array_unique(array_map(fn($s)=>explode('|',$s)[1],$users)))!==8)throw new RuntimeException('Lost/duplicated vote or mismatched counter');
    foreach(glob($dir.'/*.log') as $p)if(trim(file_get_contents($p))!=='')throw new RuntimeException('Voting worker emitted warning');
    echo 'PASS: voting, 24 concurrent workers / 240 submissions -> exactly 8 unique voters and 8 votes; replays and competing options do not double count'.PHP_EOL;
} finally {
    foreach($processes as $p)if(is_resource($p)){proc_terminate($p);proc_close($p);}
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
}
