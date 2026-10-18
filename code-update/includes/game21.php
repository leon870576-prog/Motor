<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }

require_once __DIR__.'/arcade-settings.php';

// Profile slot 99 was unused. Keep the round and its balance change in ONE locked
// profile record; all existing profile writers preserve this slot under the same lock.
function motor21_empty(): array {
    return ['v'=>1,'revision'=>'0','game'=>null,'rounds'=>0,'wins'=>0,'legacy'=>[]];
}
function motor21_decode(string $raw): array {
    if ($raw==='' || $raw==='0') return motor21_empty();
    if (!str_starts_with($raw,'g21:') || strlen($raw)>32768) throw new RuntimeException('Не удалось прочитать сохранённую игру.');
    $s=json_decode(substr($raw,4),true,32,JSON_THROW_ON_ERROR);
    if (!is_array($s) || ($s['v']??0)!==1 || !is_string($s['revision']??null) || !preg_match('/^[a-f0-9]{32}$/D',$s['revision']) || !is_array($s['legacy']??null) || !is_int($s['rounds']??null) || !is_int($s['wins']??null)) throw new RuntimeException('Не удалось прочитать сохранённую игру.');
    $g=$s['game']??null;
    if ($g!==null) {
        if (!is_array($g) || !in_array($g['status']??null,['playing','won','lost'],true) || !is_int($g['bet']??null) || $g['bet']<1 || $g['bet']>999999999) throw new RuntimeException('Повреждена сохранённая партия.');
        if(isset($g['target_win']) && !is_bool($g['target_win']))throw new RuntimeException('Повреждён режим раздачи.');
        if(isset($g['policy']) && (!is_array($g['policy']) || !in_array($g['policy']['mode']??null,['random','percent'],true) || !is_int($g['policy']['percent']??null) || $g['policy']['percent']<0 || $g['policy']['percent']>100))throw new RuntimeException('Повреждён режим раздачи.');
        $all=[];
        foreach (['player','dealer','deck'] as $key) {
            if (!is_array($g[$key]??null)) throw new RuntimeException('Повреждена колода.');
            foreach ($g[$key] as $card) {
                if (!is_int($card) || $card<1 || $card>36 || isset($all[$card])) throw new RuntimeException('Повреждена колода.');
                $all[$card]=true;
            }
        }
        if (count($all)!==36 || count($g['player'])<2 || count($g['dealer'])<2) throw new RuntimeException('Неполная колода.');
    }
    return $s;
}
function motor21_score(array $cards): int {
    $values=[6,7,8,9,10,2,3,4,11];$sum=0;
    foreach ($cards as $id) $sum+=$values[intdiv($id-1,4)];
    return $sum;
}
function motor21_rank(array $cards): int {
    $n=motor21_score($cards);
    if ($n===21) return 100;
    if ($n===22 && count($cards)===2) return 99;
    return $n>21?0:$n;
}
function motor21_deck(): array {
    $deck=range(1,36);
    for ($i=35;$i>0;$i--) { $j=random_int(0,$i);[$deck[$i],$deck[$j]]=[$deck[$j],$deck[$i]]; }
    return $deck;
}
// In the disclosed configured mode, pick the outcome before the deal and keep
// the cards consistent with it. Natural mode retains its unmodified shuffled deck.
function motor21_controlled_dealer(array &$g): void {
    $pool=array_merge($g['dealer'],$g['deck']);
    for($i=count($pool)-1;$i>0;$i--){$j=random_int(0,$i);[$pool[$i],$pool[$j]]=[$pool[$j],$pool[$i]];}
    $chosen=null;
    foreach($pool as $a)foreach($pool as $b){
        if($a===$b)continue;$sum=motor21_score([$a,$b]);
        if(!$g['target_win'] && $sum===21){$chosen=[$a,$b];break 2;}
        if($g['target_win'] && $sum<17)foreach($pool as $c){
            if($c!==$a && $c!==$b && $sum+motor21_score([$c])>21){$chosen=[$a,$b,$c];break 3;}
        }
    }
    if($chosen===null)throw new RuntimeException('Не удалось завершить раздачу.');
    $g['dealer']=$chosen;$g['deck']=array_values(array_diff($pool,$chosen));
}
function motor21_hit(array &$s): int {
    $g=&$s['game'];
    if(($g['target_win']??null)===true){
        $safe=[];foreach($g['deck'] as $index=>$card)if(motor21_rank(array_merge($g['player'],[$card]))>0)$safe[]=$index;
        if(!$safe)return motor21_finish($s);
        $index=$safe[random_int(0,count($safe)-1)];$g['player'][]=$g['deck'][$index];unset($g['deck'][$index]);$g['deck']=array_values($g['deck']);
    }else $g['player'][]=array_pop($g['deck']);
    return motor21_auto($s);
}
function motor21_finish(array &$s): int {
    $g=&$s['game'];
    if ($g['status']!=='playing') return 0;
    if (isset($g['target_win'])) motor21_controlled_dealer($g);
    elseif (motor21_rank($g['player'])!==0) {
        while (motor21_score($g['dealer'])<17 && $g['deck']) $g['dealer'][]=array_pop($g['deck']);
    }
    $win=motor21_rank($g['player'])>motor21_rank($g['dealer']);
    $g['status']=$win?'won':'lost';$s['rounds']++;if ($win) $s['wins']++;
    return $win?$g['bet']*2:0;
}
function motor21_auto(array &$s): int {
    return motor21_score($s['game']['player'])>=20?motor21_finish($s):0;
}
function motor21_legacy(): ?array {
    $bet=$_SESSION['stavka']??null;
    if ((!is_int($bet) && !(is_string($bet) && ctype_digit($bet))) || (int)$bet<1 || (int)$bet>999999999) return null;
    return ['id'=>hash('sha256','game21-legacy:'.session_id()),'bet'=>(int)$bet];
}
function motor21_forget_legacy(): void {
    foreach (['stavka','cards','bankircards','uscore','bscore'] as $key) unset($_SESSION[$key]);
}
function motor21_snapshot(string $login): array {
    $d=reading_profil($login);
    if (($d[0]??'')!==$login) throw new RuntimeException('Профиль не найден.');
    return ['state'=>motor21_decode((string)($d[99]??'')),'balance'=>max(0,(int)($d[41]??0))];
}
function motor21_apply(string $login,string $command,string $revision,string $bet,int $max,?array $legacy=null,?string $rulesRevision=null): array {
    if (!preg_match('/^[a-z0-9_-]{1,20}$/Di',$login)) throw new InvalidArgumentException('Неверный пользователь.');
    if (!in_array($command,['start','hit','stand','restore'],true)) throw new InvalidArgumentException('Неизвестное действие.');
    $path=DATADIR.'profil/'.$login.'.prof';
    if (!is_file($path) || is_link($path)) throw new RuntimeException('Профиль недоступен.');
    $fp=fopen($path,'r+b');if (!$fp) throw new RuntimeException('Профиль недоступен.');
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось сохранить ход.');
        $d=explode(':||:',stream_get_contents($fp));
        if (($d[0]??'')!==$login || empty($d[1]) || empty($d[4]) || count($d)<100) throw new RuntimeException('Профиль повреждён.');
        $s=motor21_decode((string)$d[99]);$balance=max(0,(int)$d[41]);
        $reply=fn(int $code,string $message)=>['state'=>$s,'balance'=>$balance,'code'=>$code,'message'=>$message];
        if (!hash_equals($s['revision'],$revision)) return $reply(409,'Показан актуальный ход: эта форма уже была использована.');
        $active=($s['game']['status']??'')==='playing';
        if ($command==='restore') {
            if ($legacy===null) return $reply(400,'Нет ставки из прежней версии.');
            if (in_array($legacy['id'],$s['legacy'],true)) return $reply(200,'Прежняя ставка уже возвращена.');
            if (count($s['legacy'])>=64) throw new RuntimeException('Возврат требует проверки администратора.');
            $balance+=$legacy['bet'];$s['legacy'][]=$legacy['id'];
        } elseif ($command==='start') {
            if ($active) return $reply(409,'Сначала завершите текущую партию.');
            if (!preg_match('/^[1-9][0-9]{0,8}$/D',$bet) || (int)$bet>$max || (int)$bet>$balance) return $reply(400,'Введите ставку в пределах лимита и доступного баланса.');
            $settings=motor_arcade_settings();
            if($rulesRevision!==null && !hash_equals(motor_arcade_version($settings),$rulesRevision))return $reply(409,'Условия игры изменились. Проверьте режим перед новой ставкой.');
            $policy=$settings['21'];$target=motor_arcade_target($policy);
            $deck=motor21_deck();$player=[array_pop($deck),array_pop($deck)];$dealer=[array_pop($deck),array_pop($deck)];
            $s['game']=['bet'=>(int)$bet,'status'=>'playing','player'=>$player,'dealer'=>$dealer,'deck'=>$deck,'policy'=>$policy];
            if($target!==null)$s['game']['target_win']=$target;
            $balance-=(int)$bet;$balance+=motor21_auto($s);
        } else {
            if (!$active) return $reply(409,'Партия уже завершена. Можно сыграть ещё.');
            if ($command==='hit') $balance+=motor21_hit($s);
            else $balance+=motor21_finish($s);
        }
        if (!is_int($balance) || $balance<0) throw new RuntimeException('Баланс вне допустимого диапазона.');
        $s['revision']=bin2hex(random_bytes(16));$d[41]=(string)$balance;$d[99]='g21:'.json_encode($s,JSON_THROW_ON_ERROR);
        $text=implode(':||:',array_slice($d,0,100)).':||:';
        rewind($fp);
        if (fwrite($fp,$text)!==strlen($text) || !ftruncate($fp,strlen($text)) || !fflush($fp)) throw new RuntimeException('Не удалось сохранить ход. Обновите страницу.');
        return ['state'=>$s,'balance'=>$balance,'code'=>200,'message'=>$command==='restore'?'Ставка из прежней версии возвращена на баланс.':''];
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
