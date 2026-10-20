<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}

// v1 recorded the news count only. v2 records news rewards and reviews as well.
function motor_userpage_activity_receipts($value): array {
    $empty=['news'=>[],'rewards'=>[],'reviews'=>[]];
    if ($value===null || $value==='' || $value==='0') return $empty;
    if (!is_string($value) || strlen($value)>524288 || !in_array(substr($value,0,5),['upc1:','upc2:'],true)) throw new RuntimeException('Счётчик профиля недоступен. Обратитесь к администратору.',503);
    try {$data=json_decode(substr($value,5),true,8,JSON_THROW_ON_ERROR);}
    catch (Throwable $e) {throw new RuntimeException('Счётчик профиля повреждён.',503);}
    if (str_starts_with($value,'upc1:')) {$empty['news']=motor_userpage_comment_totals($data);return $empty;}
    if (!is_array($data) || count($data)!==3) throw new RuntimeException('Счётчик профиля повреждён.',503);
    foreach ($empty as $key=>$_) $empty[$key]=motor_userpage_comment_totals($data[$key]??null);
    foreach ($empty['rewards'] as $owner=>$count) if ($count>($empty['news'][$owner]??0)) throw new RuntimeException('Счётчик наград повреждён.',503);
    return $empty;
}
function motor_userpage_activity_upgrade(array $data): array {
    if (isset($data['review_totals'])) return $data;
    // Existing reviews never contributed to either field. Include deleted reviews
    // still evidenced by the bounded retry journal, without counting a record twice.
    $seen=[];$totals=[];
    foreach ($data['guestbook'] as $row) {$seen[$row['id']]=true;$totals[$row['author']]=($totals[$row['author']]??0)+1;}
    foreach ($data['recent'] as $row) if ($row['kind']==='guest_add' && !isset($seen[$row['id']])) {$seen[$row['id']]=true;$totals[$row['actor']]=($totals[$row['actor']]??0)+1;}
    $data['review_totals']=$totals;return $data;
}
function motor_userpage_activity_sync(string $actor,string $owner,?int $news,?int $reviews,?callable $beforeWrite=null): bool {
    if (!motor_userpage_login($actor) || !motor_userpage_login($owner) || ($news!==null && ($news<0 || $news>1000000000)) || ($reviews!==null && ($reviews<0 || $reviews>1000000000))) throw new RuntimeException('Некорректный счётчик.',400);
    $path=DATADIR.'profil/'.$actor.'.prof';
    if (is_link(DATADIR.'profil') || is_link($path) || !is_file($path)) throw new RuntimeException('Профиль недоступен.',503);
    $fp=@fopen($path,'r+b');if (!$fp) throw new RuntimeException('Счётчик профиля недоступен.',503);
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Счётчик профиля временно занят.',503);
        if (fstat($fp)['size']>1048576) throw new RuntimeException('Профиль повреждён.',503);
        $raw=stream_get_contents($fp);$p=explode(':||:',$raw);
        if (($p[0]??'')!==$actor || empty($p[1]) || empty($p[4])) throw new RuntimeException('Профиль повреждён.',503);
        $state=motor_userpage_activity_receipts($p[97]??null);$count=0;$reward=0;
        if ($news!==null) {
            $news=max($news,$state['news'][$owner]??0);
            $count=$news-($state['news'][$owner]??0);$reward=$news-($state['rewards'][$owner]??0);
            if ($news>0) {$state['news'][$owner]=$news;$state['rewards'][$owner]=$news;}
        }
        if ($reviews!==null) {
            $reviews=max($reviews,$state['reviews'][$owner]??0);$delta=$reviews-($state['reviews'][$owner]??0);
            $count+=$delta;$reward+=$delta;if ($reviews>0) $state['reviews'][$owner]=$reviews;
        }
        if (!$count && !$reward) return false;
        foreach ($state as $map) motor_userpage_comment_totals($map);
        $marker='upc2:'.json_encode($state,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        if (strlen($marker)>524288) throw new RuntimeException('Достигнут лимит счётчика профиля.',409);
        $p=array_pad($p,100,'');
        foreach (motor_comment_activity_deltas($count,$reward) as $field=>$delta) $p[$field]=(string)(max(0,(int)($p[$field]??0))+$delta);
        $p[97]=$marker;$next=implode(':||:',$p);
        if ($beforeWrite) $beforeWrite('profil/'.$actor.'.prof',$raw);
        rewind($fp);
        if (fwrite($fp,$next)!==strlen($next) || !ftruncate($fp,strlen($next)) || !fflush($fp)) {
            rewind($fp);fwrite($fp,$raw);ftruncate($fp,strlen($raw));fflush($fp);
            throw new RuntimeException('Запись сохранена, но счётчики не обновлены. Повторите отправку той же формы.',503);
        }
        return true;
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
// Called only by the CLI migration. Backups are placed outside the web root.
function motor_userpage_activity_migrate(string $backupRoot): array {
    // Another migration may create the root before this process acquires its lock.
    if (!is_dir($backupRoot) && !@mkdir($backupRoot,0700,true) && !is_dir($backupRoot)) throw new RuntimeException('Cannot create activity backup');
    if (is_link($backupRoot) || !is_dir($backupRoot)) throw new RuntimeException('Unsafe activity backup');
    $lockPath=$backupRoot.'/migration.lock';if (is_link($lockPath)) throw new RuntimeException('Unsafe migration lock');
    $lock=fopen($lockPath,'c');if (!$lock) throw new RuntimeException('Cannot open migration lock');
    try {
    if (!flock($lock,LOCK_EX)) throw new RuntimeException('Cannot lock migration');
    $backup=function(string $relative,string $raw) use($backupRoot): void {
        if (!preg_match('~^(profil/[a-z0-9-]{3,20}\.prof|userpages/[a-z0-9-]{3,20}\.json)$~Di',$relative)) throw new RuntimeException('Invalid backup path');
        $dir=$backupRoot.'/'.dirname($relative);$path=$backupRoot.'/'.$relative;
        if (is_link($dir) || is_link($path)) throw new RuntimeException('Unsafe backup path');
        if (!is_dir($dir) && !mkdir($dir,0700)) throw new RuntimeException('Cannot create backup directory');
        if (is_file($path)) return; // Preserve the original snapshot across retries.
        motor_media_atomic($path,$raw);chmod($path,0600);
    };
    $report=['pages'=>0,'profile_updates'=>0,'missing_profiles'=>0];
    $root=motor_userpage_root();if (is_link($root)) throw new RuntimeException('Unsafe userpages directory');
    foreach (glob($root.'/*.json')?:[] as $path) {
        $owner=basename($path,'.json');if (!motor_userpage_login($owner)) throw new RuntimeException('Invalid page owner');
        // A deleted owner may leave a page; its authors must still receive earned activity.
        $lockPath=$root.'/'.$owner.'.lock';if (is_link($lockPath)) throw new RuntimeException('Unsafe page lock');
        $fp=fopen($lockPath,'c');if (!$fp) throw new RuntimeException('Cannot open page lock');
        try {
            if (!flock($fp,LOCK_EX)) throw new RuntimeException('Cannot lock page');
            $old=motor_userpage_read($owner);$next=motor_userpage_activity_upgrade($old);
            if ($next!==$old) {
                motor_userpage_validate($next,$owner);$json=json_encode($next,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
                if (strlen($json)>8*1048576) throw new RuntimeException('Page storage full');
                $backup('userpages/'.$owner.'.json',file_get_contents($path));motor_media_atomic($path,$json);$report['pages']++;
            }
            foreach (array_unique(array_merge(array_keys($next['comment_totals']??[]),array_keys($next['review_totals']))) as $actor) {
                $actor=(string)$actor;if (!is_file(DATADIR.'profil/'.$actor.'.prof')) {$report['missing_profiles']++;continue;}
                if (motor_userpage_activity_sync($actor,$owner,$next['comment_totals'][$actor]??0,$next['review_totals'][$actor]??0,$backup)) $report['profile_updates']++;
            }
        } finally {flock($fp,LOCK_UN);fclose($fp);}
    }
    // Also reward known v1 news contributions whose page no longer exists.
    foreach (glob(DATADIR.'profil/*.prof')?:[] as $path) {
        $actor=basename($path,'.prof');if (!motor_userpage_login($actor)) continue;
        $p=motor_userpage_profile($actor);$receipts=motor_userpage_activity_receipts($p[97]??null);
        foreach ($receipts['news'] as $owner=>$count) if (motor_userpage_activity_sync($actor,(string)$owner,$count,null,$backup)) $report['profile_updates']++;
    }
    return $report;
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}
