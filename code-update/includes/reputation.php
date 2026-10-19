<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}

function motor_reputation_login($value): bool {
    return is_string($value) && (bool)preg_match('/^[a-z0-9-]{3,20}$/Di',$value);
}
// Keep every known vote, including the last 20 rows written by older releases.
// Old aggregate counters include unavailable history and must not be rebuilt.
function motor_reputation_history(string $raw): array {
    if (strlen($raw)>2097152) throw new RuntimeException('Повреждена история голосов.',503);
    $votes=[];
    foreach (preg_split('/\r?\n/',$raw,-1,PREG_SPLIT_NO_EMPTY) as $row) {
        if (!preg_match('/^([a-zA-Z0-9-]{3,20})\|([+-])\|(?:([a-f0-9]{32})\|)?$/D',$row,$m)
            || isset($votes[$m[1]])) throw new RuntimeException('Повреждена история голосов.',503);
        $votes[$m[1]]=['sign'=>$m[2]==='+'?1:-1,'revision'=>$m[3]??substr(hash('sha256',$row),0,32)];
        if (count($votes)>20000) throw new RuntimeException('Слишком большая история голосов.',503);
    }
    return $votes;
}
function motor_reputation_read(string $actor): array {
    if (!motor_reputation_login($actor)) return [];
    $root=DATADIR.'dataraiting';$path=$root.'/'.$actor.'.dat';
    if (is_link($root) || is_link($path) || !is_dir($root) || (file_exists($path) && !is_file($path))) throw new RuntimeException('История голосов недоступна.',503);
    if (!file_exists($path)) return [];
    $fp=@fopen($path,'rb');if (!$fp) throw new RuntimeException('История голосов недоступна.',503);
    try {
        if (!flock($fp,LOCK_SH)) throw new RuntimeException('История голосов недоступна.',503);
        return motor_reputation_history(stream_get_contents($fp,2097153));
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
function motor_reputation_form(string $owner): void {
    global $log;
    if (!motor_reputation_login($owner)) return;
    try {$current=motor_reputation_read((string)($log??''))[$owner]??null;}
    catch (RuntimeException $e) {echo '<p role="alert">Не удалось прочитать вашу оценку. Попробуйте позже.</p>';return;}
    $sign=$current['sign']??0;
    echo '<p class="up-meta">Ваша оценка: <strong>'.($sign===0?'ещё не поставлена':($sign===1?'+1':'−1')).'</strong>.</p>';
    echo '<form class="up-actions reputation-form" method="post" action="'.BASEDIR.'pages/raiting.php?uz='.rawurlencode($owner).'">';
    motor_form_token();
    echo '<input type="hidden" name="revision" value="'.($current['revision']??'none').'">';
    echo '<button type="submit" name="vote" value="plus" aria-label="Повысить авторитет пользователя"'.($sign===1?' disabled aria-pressed="true"':' aria-pressed="false"').'>+1</button> <button type="submit" name="vote" value="minus" aria-label="Понизить авторитет пользователя"'.($sign===-1?' disabled aria-pressed="true"':' aria-pressed="false"').'>−1</button></form>';
    echo '<p class="up-meta">Голосование доступно от '.motor_points_min('reputation').' баллов активности. Получать голоса можно с первого дня. Между голосами за новых получателей — 3 часа. Свою оценку можно изменить сразу: прежний голос заменяется, повтор той же оценки ничего не добавляет. За себя голосовать нельзя.</p>';
}
function motor_reputation_write($fp,string $text): void {
    rewind($fp);$done=0;$length=strlen($text);
    while ($done<$length) {$n=fwrite($fp,substr($text,$done));if ($n===false || $n===0) throw new RuntimeException('Не удалось сохранить голос. Повторите позже.',503);$done+=$n;}
    if (!ftruncate($fp,$length) || !fflush($fp)) throw new RuntimeException('Не удалось сохранить голос. Повторите позже.',503);
}
// Same profile locks as motor_profile_update; sort to avoid opposing-vote deadlocks.
function motor_reputation_vote($actor,$target,$vote,int $now,string $credentialHash,$expectedRevision=null): array {
    global $config;
    if (!motor_reputation_login($actor) || !motor_reputation_login($target)) throw new RuntimeException('Пользователь не найден.',404);
    if (!is_string($vote) || !in_array($vote,['plus','minus'],true)) throw new RuntimeException('Выберите плюс или минус.',400);
    if ($expectedRevision!==null && (!is_string($expectedRevision) || !preg_match('/^(?:none|[a-f0-9]{32})$/D',$expectedRevision))) throw new RuntimeException('Обновите страницу с оценкой.',400);
    if ($actor===$target) throw new RuntimeException('Нельзя изменять авторитет самому себе.',403);
    $root=DATADIR.'dataraiting';
    if (is_link(DATADIR.'profil') || is_link($root) || !is_dir($root)) throw new RuntimeException('Хранилище голосов недоступно.',503);
    $names=[$actor,$target];sort($names,SORT_STRING);$handles=[];$profiles=[];$original=[];$history=null;
    try {
        foreach ($names as $name) {
            $path=DATADIR.'profil/'.$name.'.prof';
            if (is_link($path) || !is_file($path)) throw new RuntimeException('Пользователь не найден.',404);
            $fp=@fopen($path,'r+b');if (!$fp) throw new RuntimeException('Профиль недоступен.',503);$handles[$name]=$fp;
            if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать профиль.',503);
            $stat=fstat($fp);if (!$stat || $stat['size']>1048576) throw new RuntimeException('Повреждён профиль.',503);
            $raw=stream_get_contents($fp);$p=explode(':||:',$raw);
            if (count($p)<52 || ($p[0]??'')!==$name || empty($p[1]) || empty($p[4])) throw new RuntimeException('Повреждён профиль.',503);
            $profiles[$name]=$p;$original[$name]=$raw;
        }
        $voter=$profiles[$actor];
        if ($credentialHash==='' || !hash_equals($voter[1],$credentialHash)) throw new RuntimeException('Войдите на сайт заново.',403);
        if ((int)$voter[37]===1 && (int)$voter[38]>$now) throw new RuntimeException('Голосование недоступно во время блокировки.',403);
        if (!empty($config['regkeys']) && (int)$voter[46]===1) throw new RuntimeException('Подтвердите регистрацию.',403);
        if ((int)$voter[6]+max(0,(int)($config['karantin']??0))>$now) throw new RuntimeException('Дождитесь окончания карантина регистрации.',403);
        if ((int)$voter[36]<motor_points_min('reputation')) throw new RuntimeException('Для голосования нужно '.motor_points_min('reputation').' баллов активности. Получать голоса можно без этого ограничения.',403);
        $path=$root.'/'.$actor.'.dat';
        if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('История голосов недоступна.',503);
        $history=@fopen($path,'c+b');if (!$history || !flock($history,LOCK_EX)) throw new RuntimeException('История голосов недоступна.',503);
        @chmod($path,0600);$stat=fstat($history);
        if (!$stat || $stat['size']>2097152) throw new RuntimeException('Повреждена история голосов.',503);
        $oldHistory=stream_get_contents($history);$votes=motor_reputation_history($oldHistory);
        $previous=$votes[$target]['sign']??0;$sign=$vote==='plus'?1:-1;
        // A retry never credits again or sends a second notification.
        if ($previous===$sign) return ['profile'=>$profiles[$target],'changed'=>false,'previous'=>$previous];
        if ($expectedRevision!==null && !hash_equals($votes[$target]['revision']??'none',$expectedRevision)) throw new RuntimeException('Оценка уже изменилась в другой вкладке. Обновите страницу.',409);
        if ($previous===0 && (int)$voter[48]>$now) throw new RuntimeException('Голосовать за нового получателя можно раз в 3 часа. Свою прежнюю оценку можно изменить сразу.',429);
        if ($previous===0 && count($votes)>=20000) throw new RuntimeException('Достигнут предел истории голосов.',503);
        // No activity threshold for recipients, including newly registered accounts.
        foreach ([49,50,51] as $field) if (!preg_match('/^-?[0-9]{1,15}$/D',(string)$profiles[$target][$field])) throw new RuntimeException('Повреждён счётчик авторитета.',503);
        if ((int)$profiles[$target][50]<0 || (int)$profiles[$target][51]<0 || ($previous!==0 && (int)$profiles[$target][$previous===1?50:51]<1)) throw new RuntimeException('История и счётчики авторитета не совпадают. Обратитесь к администратору.',503);
        if ($previous===0) $profiles[$actor][48]=(string)($now+10800);
        else $profiles[$target][$previous===1?50:51]=(string)((int)$profiles[$target][$previous===1?50:51]-1);
        $profiles[$target][49]=(string)((int)$profiles[$target][49]+$sign-$previous);
        $profiles[$target][$sign===1?50:51]=(string)((int)$profiles[$target][$sign===1?50:51]+1);
        foreach ([49,50,51] as $field) if (abs((int)$profiles[$target][$field])>999999999999999) throw new RuntimeException('Достигнут предел счётчика авторитета.',503);
        $votes[$target]=['sign'=>$sign,'revision'=>bin2hex(random_bytes(16))];$rows=[];
        foreach ($votes as $name=>$entry) $rows[]=$name.'|'.($entry['sign']===1?'+':'-').'|'.$entry['revision'].'|';
        // Ordinary write failures roll back below. These separate legacy files
        // are not a crash-atomic transaction; restore them together from backup.
        try {
            motor_reputation_write($history,implode("\r\n",$rows)."\r\n");
            if ($previous===0) motor_reputation_write($handles[$actor],implode(':||:',$profiles[$actor]));
            motor_reputation_write($handles[$target],implode(':||:',$profiles[$target]));
        } catch (Throwable $error) {
            // Restore the target first; preserve reservations if rollback fails.
            motor_reputation_write($handles[$target],$original[$target]);
            motor_reputation_write($handles[$actor],$original[$actor]);
            motor_reputation_write($history,$oldHistory);
            throw $error;
        }
        return ['profile'=>$profiles[$target],'changed'=>true,'previous'=>$previous];
    } finally {
        if (is_resource($history)) {flock($history,LOCK_UN);fclose($history);}
        foreach (array_reverse($handles) as $fp) {flock($fp,LOCK_UN);fclose($fp);}
    }
}
function motor_reputation_notify(string $actor,string $target,string $vote,int $now,int $previous=0): void {
    global $config;
    if (empty($config['notificraiting']) || !motor_reputation_login($actor) || !motor_reputation_login($target)) return;
    $path=DATADIR.'privat/'.$target.'.priv';
    if (is_link(DATADIR.'privat') || is_link($path) || !is_dir(DATADIR.'privat')) return;
    $fp=@fopen($path,'c+b');if (!$fp) return;
    try {
        if (!flock($fp,LOCK_EX)) return;
        $message=$previous===0?($vote==='plus'?' повысил':' понизил').' ваш авторитет на 1.':' изменил оценку вашего авторитета с '.($previous===1?'+1':'−1').' на '.($vote==='plus'?'+1':'−1').'.';
        $text=$actor.'|Пользователь '.$actor.$message.'|'.$now."|\r\n";
        $stat=fstat($fp);if (!$stat || $stat['size']+strlen($text)>max(0,(int)($config['limitsmail']??0))*1024) return;
        fseek($fp,0,SEEK_END);
        if (fwrite($fp,$text)===strlen($text) && fflush($fp)) increment_profil($target,[10=>1]);
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
