<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }

// Internal paths only. Reads use the same advisory locks as legacy writers.
function motor_info_read(string $path): string {
    if (!is_file($path) || is_link($path)) return '';
    $fp=fopen($path,'rb');
    if (!$fp) return '';
    try { if (!flock($fp,LOCK_SH)) return ''; return stream_get_contents($fp); }
    finally { flock($fp,LOCK_UN);fclose($fp); }
}
function motor_info_lines(string $path): array {
    return array_values(array_filter(preg_split('/\r\n|\n|\r/',motor_info_read($path)),fn($s)=>trim($s)!==''));
}
function motor_info_id($id): bool { return is_string($id) && preg_match('/^[0-9]{1,18}$/D',$id)===1; }
function motor_info_profiles(): array {
    $profiles=[];
    foreach (glob(DATADIR.'profil/*.prof')?:[] as $path) {
        $login=basename($path,'.prof');
        if (!preg_match('/^[a-z0-9_-]{1,20}$/Di',$login)) continue;
        $d=explode(':||:',motor_info_read($path));
        if (($d[0]??'')===$login && !empty($d[1]) && isset($d[75])) $profiles[$login]=$d;
    }
    return $profiles;
}
function motor_info_forum(?string $only=null): array {
    $topics=0;$posts=0;$seen=[];
    foreach (motor_info_lines(DATADIR.'dataforum/mainforum.dat') as $row) {
        $fid=explode('|',$row)[0];
        if (!motor_info_id($fid) || isset($seen[$fid]) || ($only!==null && $fid!==$only)) continue;
        $seen[$fid]=true;$topicIds=[];
        foreach (motor_info_lines(DATADIR.'dataforum/topic'.$fid.'.dat') as $topic) {
            $tid=explode('|',$topic)[0];
            if (!motor_info_id($tid) || isset($topicIds[$tid])) continue;
            $topicIds[$tid]=true;$topics++;
            $posts+=count(motor_info_lines(DATADIR.'dataforum/'.$fid.'-'.$tid.'.dat'));
        }
    }
    return [$topics,$posts];
}
function motor_info_count(int $number): int {
    $paths=[0=>'book.dat',4=>'adminchat.dat',8=>'chat.dat'];
    if (isset($paths[$number])) return count(motor_info_lines(DATADIR.$paths[$number]));
    if ($number===1 || $number===2) return motor_info_forum()[$number-1];
    $total=0;$seen=[];
    if ($number===3) {
        foreach (motor_info_lines(DATADIR.'news.dat') as $row) {
            $id=explode('|',$row)[5]??'';
            if (!motor_info_id($id) || isset($seen[$id])) continue;
            $seen[$id]=true;$total+=count(motor_info_lines(DATADIR.'datakomm/'.$id.'.dat'));
        }
        require_once __DIR__.'/userpages.php';
        return $total+motor_userpage_public_comment_count();
    }
    if ($number===7) {
        require_once __DIR__.'/gallery.php';
        foreach (motor_gallery_rows() as $row) {
            $d=explode('|',$row);$id=$d[6]??'';
            if (!motor_gallery_valid_id($id) || isset($seen[$id]) || !motor_gallery_visible(['data'=>$d]) || !is_file(DATADIR.'datagallery/'.$id)) continue;
            $seen[$id]=true;$total+=count(motor_info_lines(DATADIR.'datagallery/'.$id.'.dat'));
        }
        return $total;
    }
    // Download/library modules are absent from this distribution; retain their legacy totals.
    $d=explode('|',motor_info_read(DATADIR.'local.dat'));
    return max(0,(int)($d[$number]??0));
}
function motor_info_board(): int {
    $total=0;$seen=[];
    foreach (motor_info_lines(DATADIR.'databoard/database.dat') as $row) {
        $id=explode('|',$row)[2]??'';
        if (!motor_info_id($id) || isset($seen[$id])) continue;
        $seen[$id]=true;
        foreach (motor_info_lines(DATADIR.'databoard/'.$id.'.dat') as $item) {
            $d=explode('|',$item);
            if (isset($d[5]) && motor_info_id($d[5]) && (int)($d[4]??0)>=SITETIME) $total++;
        }
    }
    return $total;
}

// Serialize read/modify/write, not only the final write. Deltas use the latest profile.
function motor_profile_update(string $login,array $set,array $delta=[]): void {
    global $config;
    if (!preg_match('/^[a-z0-9_-]{1,20}$/Di',$login)) throw new InvalidArgumentException('Неверный пользователь.');
    $path=DATADIR.'profil/'.$login.'.prof';
    if (!is_file($path) || is_link($path)) return;
    $fp=fopen($path,'r+b');
    if (!$fp) throw new RuntimeException('Не удалось открыть профиль.');
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать профиль.');
        $d=explode(':||:',stream_get_contents($fp));
        if (empty($d[0]) || empty($d[1]) || empty($d[4])) throw new RuntimeException('Повреждён профиль.');
        foreach ($set as $key=>$value) if (is_int($key) && $key>=0 && $key<$config['userprofkey'] && isset($value)) $d[$key]=$value;
        foreach ($delta as $key=>$value) {
            if (!is_int($key) || !in_array($key,[8,9,10,11,12,33,36,41,49,50,51,64],true) || !is_int($value)) throw new InvalidArgumentException('Неверный счётчик профиля.');
            $d[$key]=max($key===49?PHP_INT_MIN:0,(int)($d[$key]??0)+$value);
        }
        if ($d[0]!==$login || !is_string($d[1]) || $d[1]==='' || !is_string($d[4]) || $d[4]==='') throw new InvalidArgumentException('Не заполнены обязательные поля профиля.');
        $text='';for($i=0;$i<$config['userprofkey'];$i++)$text.=($d[$i]??'').':||:';
        rewind($fp);
        if (fwrite($fp,$text)!==strlen($text) || !ftruncate($fp,strlen($text)) || !fflush($fp)) throw new RuntimeException('Не удалось сохранить профиль.');
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
function increment_profil(string $login,array $delta,array $set=[]): void {motor_profile_update($login,$set,$delta);}

function motor_info_online_rows(?array $rows=null,?int $now=null): array {
    $now??=SITETIME;$out=[];
    foreach ($rows??motor_info_lines(DATADIR.'online.dat') as $row) {
        $d=array_pad(explode('|',$row),4,'');$at=(int)$d[0];
        if ($at<=$now-600 || $at>$now || $d[1]==='') continue;
        if ($d[2]!=='' && !preg_match('/^[a-z0-9-]{1,20}$/Di',$d[2])) continue;
        $key=$d[2]!==''?'user:'.$d[2]:'guest:'.$d[1];
        if (!isset($out[$key]) || (int)$out[$key][0]<$at) $out[$key]=$d;
    }
    return array_values($out);
}
function motor_info_online(): array {
    $rows=motor_info_online_rows();$registered=count(array_filter($rows,fn($d)=>$d[2]!==''));
    return ['total'=>count($rows),'registered'=>$registered,'guests'=>count($rows)-$registered,'rows'=>$rows];
}
function motor_info_presence(): bool {
    global $ip,$log,$brow;
    $fp=fopen(DATADIR.'online.dat','c+b');
    if (!$fp) throw new RuntimeException('Не удалось обновить онлайн.');
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось обновить онлайн.');
        $rows=motor_info_online_rows(preg_split('/\r\n|\n|\r/',stream_get_contents($fp)));
        $found=false;$keep=[];
        foreach ($rows as $d) {
            if ($d[1]===$ip) $found=true;
            if (($log!=='' && $d[2]===$log) || ($d[2]==='' && $d[1]===$ip)) continue;
            $keep[]=implode('|',array_slice($d,0,4)).'|';
        }
        $keep[]=no_br(SITETIME.'|'.$ip.'|'.$log.'|'.$brow.'|');
        $text=implode("\r\n",$keep)."\r\n";rewind($fp);
        if (fwrite($fp,$text)!==strlen($text) || !ftruncate($fp,strlen($text)) || !fflush($fp)) throw new RuntimeException('Не удалось сохранить онлайн.');
        return $found;
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}

// Keep the five legacy fields and append the full timestamp, so equal day/hour
// numbers after an idle month cannot keep an old bucket alive.
function motor_info_traffic_state(string $kind,int $now): array {
    if (!in_array($kind,['hits','host'],true)) throw new InvalidArgumentException('Неверный счётчик.');
    $path=DATADIR.'datacounter/'.$kind.'.dat';
    $d=array_pad(explode('|',motor_info_read($path)),6,'');
    $at=ctype_digit($d[5])?(int)$d[5]:(is_file($path)?(int)filemtime($path):$now);
    return [$d,$at];
}
function motor_info_traffic_current(string $kind,?int $now=null): array {
    $now??=SITETIME;[$d,$at]=motor_info_traffic_state($kind,$now);
    return ['day'=>date('Y-m-d',$at)===date('Y-m-d',$now)?max(0,(int)$d[1]):0,
        'hour'=>date('Y-m-d H',$at)===date('Y-m-d H',$now)?max(0,(int)$d[4]):0,
        'all'=>max(0,(int)$d[2])];
}
function motor_info_traffic_archive(string $kind,int $size,int $end,int $value,int $now): void {
    $step=$size===24?3600:86400;$path=DATADIR.'datacounter/'.$size.'_'.$kind.'.dat';$map=[];
    foreach(motor_info_lines($path) as $line){$d=explode('|',$line);if(isset($d[1]) && ctype_digit($d[1]) && (int)$d[1]>$now-$size*$step && (int)$d[1]<=$now)$map[(int)$d[1]]=max(0,(int)$d[0]);}
    if($end>$now-$size*$step && $end<=$now)$map[$end]=$value;
    ksort($map);$rows=[];foreach(array_slice($map,-$size,null,true) as $at=>$n)$rows[]=$n.'|'.$at.'|';
    write_files($path,$rows?implode("\r\n",$rows)."\r\n":'',1,0666);
}
function motor_info_traffic_tick(string $kind,int $increment,?int $now=null): void {
    if (!in_array($kind,['hits','host'],true) || !in_array($increment,[0,1],true)) throw new InvalidArgumentException('Неверный счётчик.');
    $now??=SITETIME;$path=DATADIR.'datacounter/'.$kind.'.dat';
    $legacyAt=is_file($path)?(int)filemtime($path):$now;
    $fp=fopen($path,'c+b');if(!$fp)throw new RuntimeException('Не удалось открыть счётчик.');
    try {
        if(!flock($fp,LOCK_EX))throw new RuntimeException('Не удалось заблокировать счётчик.');
        $d=array_pad(explode('|',stream_get_contents($fp)),6,'');
        $at=ctype_digit($d[5])?(int)$d[5]:$legacyAt;
        $day=max(0,(int)$d[1]);$all=max(0,(int)$d[2]);$hour=max(0,(int)$d[4]);
        if(date('Y-m-d H',$at)!==date('Y-m-d H',$now)){
            motor_info_traffic_archive($kind,24,(int)(floor($at/3600)+1)*3600,$hour,$now);$hour=0;
        }
        if(date('Y-m-d',$at)!==date('Y-m-d',$now)){
            motor_info_traffic_archive($kind,31,strtotime('tomorrow',$at),$day,$now);$day=0;
        }
        $text=date('d',$now).'|'.($day+$increment).'|'.($all+$increment).'|'.date('H',$now).'|'.($hour+$increment).'|'.$now.'|';
        rewind($fp);if(fwrite($fp,$text)!==strlen($text) || !ftruncate($fp,strlen($text)) || !fflush($fp))throw new RuntimeException('Не удалось сохранить счётчик.');
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
function motor_info_traffic_series(string $kind,int $size,?int $now=null): array {
    if(!in_array($kind,['hits','host'],true) || !in_array($size,[24,31],true))throw new InvalidArgumentException('Неверный счётчик.');
    $now??=SITETIME;$step=$size===24?3600:86400;
    $start=$size===24?(int)floor($now/3600)*3600:strtotime('today',$now);$out=[];
    for($i=$size-1;$i>=0;$i--)$out[$start-$i*$step]=0;
    foreach(motor_info_lines(DATADIR.'datacounter/'.$size.'_'.$kind.'.dat') as $row){$d=explode('|',$row);$at=(int)($d[1]??0)-$step;if(array_key_exists($at,$out))$out[$at]=max(0,(int)$d[0]);}
    [$d,$at]=motor_info_traffic_state($kind,$now);
    $current=$size===24?(int)floor($at/3600)*3600:strtotime('today',$at);
    if(array_key_exists($current,$out))$out[$current]=max(0,(int)$d[$size===24?4:1]);
    return $out;
}
