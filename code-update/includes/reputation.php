<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}

function motor_reputation_login($value): bool {
    return is_string($value) && (bool)preg_match('/^[a-z0-9-]{3,20}$/Di',$value);
}
function motor_reputation_form(string $owner): void {
    if (!motor_reputation_login($owner)) return;
    echo '<form class="up-actions reputation-form" method="post" action="'.BASEDIR.'pages/raiting.php?uz='.rawurlencode($owner).'">';
    motor_form_token();
    echo '<button type="submit" name="vote" value="plus" aria-label="Повысить авторитет пользователя">+1 к авторитету</button> <button type="submit" name="vote" value="minus" aria-label="Понизить авторитет пользователя">−1 к авторитету</button></form>';
    echo '<p class="up-meta">Голосование доступно от '.motor_points_min('reputation').' баллов активности. Получать голоса можно с первого дня. Между голосами — 3 часа; за себя и повторно за одного из последних 20 получателей голосовать нельзя.</p>';
}
function motor_reputation_write($fp,string $text): void {
    rewind($fp);$done=0;$length=strlen($text);
    while ($done<$length) {$n=fwrite($fp,substr($text,$done));if ($n===false || $n===0) throw new RuntimeException('Не удалось сохранить голос. Повторите позже.',503);$done+=$n;}
    if (!ftruncate($fp,$length) || !fflush($fp)) throw new RuntimeException('Не удалось сохранить голос. Повторите позже.',503);
}
// Same profile locks as motor_profile_update; sort to avoid opposing-vote deadlocks.
function motor_reputation_vote($actor,$target,$vote,int $now,string $credentialHash): array {
    global $config;
    if (!motor_reputation_login($actor) || !motor_reputation_login($target)) throw new RuntimeException('Пользователь не найден.',404);
    if (!is_string($vote) || !in_array($vote,['plus','minus'],true)) throw new RuntimeException('Выберите плюс или минус.',400);
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
        if ((int)$voter[48]>$now) throw new RuntimeException('Изменять авторитет можно раз в 3 часа.',429);
        $path=$root.'/'.$actor.'.dat';
        if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('История голосов недоступна.',503);
        $history=@fopen($path,'c+b');if (!$history || !flock($history,LOCK_EX)) throw new RuntimeException('История голосов недоступна.',503);
        @chmod($path,0600);$stat=fstat($history);
        if (!$stat || $stat['size']>65536) throw new RuntimeException('Повреждена история голосов.',503);
        $oldHistory=stream_get_contents($history);$rows=preg_split('/\r?\n/',$oldHistory,-1,PREG_SPLIT_NO_EMPTY);
        foreach ($rows as $row) {
            if (!preg_match('/^([a-z0-9-]{3,20})\|[+-]\|$/Di',$row,$match)) throw new RuntimeException('Повреждена история голосов.',503);
            if ($match[1]===$target) throw new RuntimeException('Вы уже изменяли авторитет этому пользователю.',409);
        }
        // No activity threshold for recipients, including newly registered accounts.
        $sign=$vote==='plus'?1:-1;$counter=$sign===1?50:51;
        foreach ([49,50,51] as $field) if (!preg_match('/^-?[0-9]{1,15}$/D',(string)$profiles[$target][$field])) throw new RuntimeException('Повреждён счётчик авторитета.',503);
        $profiles[$actor][48]=(string)($now+10800);
        $profiles[$target][49]=(string)((int)$profiles[$target][49]+$sign);
        $profiles[$target][$counter]=(string)((int)$profiles[$target][$counter]+1);
        $rows=array_slice($rows,-19);$rows[]=$target.'|'.($sign===1?'+':'-').'|';
        // Reserve before crediting. Abrupt termination can leave an uncredited
        // reservation, but never a credited vote that can be replayed.
        try {
            motor_reputation_write($history,implode("\r\n",$rows)."\r\n");
            motor_reputation_write($handles[$actor],implode(':||:',$profiles[$actor]));
            motor_reputation_write($handles[$target],implode(':||:',$profiles[$target]));
        } catch (Throwable $error) {
            // Restore the target first; preserve reservations if rollback fails.
            motor_reputation_write($handles[$target],$original[$target]);
            motor_reputation_write($handles[$actor],$original[$actor]);
            motor_reputation_write($history,$oldHistory);
            throw $error;
        }
        return $profiles[$target];
    } finally {
        if (is_resource($history)) {flock($history,LOCK_UN);fclose($history);}
        foreach (array_reverse($handles) as $fp) {flock($fp,LOCK_UN);fclose($fp);}
    }
}
function motor_reputation_notify(string $actor,string $target,string $vote,int $now): void {
    global $config;
    if (empty($config['notificraiting']) || !motor_reputation_login($actor) || !motor_reputation_login($target)) return;
    $path=DATADIR.'privat/'.$target.'.priv';
    if (is_link(DATADIR.'privat') || is_link($path) || !is_dir(DATADIR.'privat')) return;
    $fp=@fopen($path,'c+b');if (!$fp) return;
    try {
        if (!flock($fp,LOCK_EX)) return;
        $text=$actor.'|Пользователь '.$actor.($vote==='plus'?' повысил':' понизил').' ваш авторитет на 1.|'.$now."|\r\n";
        $stat=fstat($fp);if (!$stat || $stat['size']+strlen($text)>max(0,(int)($config['limitsmail']??0))*1024) return;
        fseek($fp,0,SEEK_END);
        if (fwrite($fp,$text)===strlen($text) && fflush($fp)) increment_profil($target,[10=>1]);
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
