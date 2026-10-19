<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}

// Field 96 belongs to the wallet; 97/98/99 belong to comments and games.
function motor_wallet_login($v): bool {return is_string($v) && (bool)preg_match('/^[a-z0-9-]{3,20}$/Di',$v);}
function motor_wallet_integer($v,int $max=1000000000000): int {
    if ((!is_string($v) && !is_int($v)) || !preg_match('/^(0|[1-9][0-9]{0,12})$/D',(string)$v) || (int)$v>$max) throw new RuntimeException('Укажите целое неотрицательное число.',400);
    return (int)$v;
}
function motor_wallet_state(array $p): array {
    $raw=$p[96]??'';
    if ($raw==='' || $raw==='0') return ['revision'=>0,'outgoing'=>[],'incoming'=>[],'last'=>null];
    try {
        if (!str_starts_with($raw,'wallet1:') || strlen($raw)>524288) throw new RuntimeException();
        $s=json_decode(substr($raw,8),true,10,JSON_THROW_ON_ERROR);
        if (!is_array($s) || !isset($s['revision'],$s['outgoing'],$s['incoming']) || !array_key_exists('last',$s)) throw new RuntimeException();
        motor_wallet_integer($s['revision']);
        foreach (['outgoing','incoming'] as $key) {
            if (!is_array($s[$key]) || count($s[$key])>10000) throw new RuntimeException();
            foreach ($s[$key] as $identity=>$total) if (!preg_match('/^[a-f0-9]{64}$/D',(string)$identity) || motor_wallet_integer($total)<1) throw new RuntimeException();
        }
        if ($s['last']!==null) {
            $l=$s['last'];
            if (!is_array($l) || !in_array($l['kind']??null,['transfer','credit'],true) || !is_bool($l['pending']??null) || motor_wallet_integer($l['revision']??null)+1!==$s['revision'] || motor_wallet_integer($l['amount']??null)>($l['kind']==='transfer'?1000000000:1000000000000)) throw new RuntimeException();
            if ($l['kind']==='transfer' && (!motor_wallet_login($l['target']??null) || !preg_match('/^[a-f0-9]{64}$/D',(string)($l['target_identity']??'')) || $l['amount']<1)) throw new RuntimeException();
            if ($l['kind']==='credit' && (!in_array($l['operation']??null,['1','2','3'],true) || $l['pending'])) throw new RuntimeException();
        } elseif ($s['revision']!==0) throw new RuntimeException();
        return $s;
    } catch(Throwable $e) {throw new RuntimeException('Данные кошелька повреждены. Обратитесь к администратору.',503);}
}
function motor_wallet_identity(array $p): string {return hash('sha256',$p[0]."\0".$p[6]);}
function motor_wallet_authorize(array $p,string $hash,int $now): void {
    global $config;
    if ($hash==='' || !hash_equals($p[1],$hash)) throw new RuntimeException('Войдите на сайт заново.',403);
    if ((int)$p[37]===1 && (int)$p[38]>$now) throw new RuntimeException('Операции недоступны во время блокировки.',403);
    if (!empty($config['regkeys']) && (int)$p[46]===1) throw new RuntimeException('Подтвердите регистрацию.',403);
    if ((int)$p[6]+max(0,(int)($config['karantin']??0))>$now) throw new RuntimeException('Дождитесь окончания карантина регистрации.',403);
}
function motor_wallet_locked(array $names,callable $callback) {
    if (is_link(DATADIR.'profil') || !is_dir(DATADIR.'profil')) throw new RuntimeException('Хранилище профилей недоступно.',503);
    sort($names,SORT_STRING);$handles=[];$profiles=[];
    try {
        foreach(array_unique($names) as $name) {
            if (!motor_wallet_login($name)) throw new RuntimeException('Недопустимый логин.',400);
            $path=DATADIR.'profil/'.$name.'.prof';
            if (is_link($path) || !is_file($path)) throw new RuntimeException('Пользователь не найден.',404);
            $fp=@fopen($path,'r+b');if (!$fp) throw new RuntimeException('Профиль недоступен.',503);$handles[$name]=$fp;
            if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать профиль.',503);
            $stat=fstat($fp);if (!$stat || $stat['size']>1048576) throw new RuntimeException('Повреждён профиль.',503);
            $p=explode(':||:',stream_get_contents($fp));
            if (count($p)<55 || ($p[0]??'')!==$name || empty($p[1]) || empty($p[4])) throw new RuntimeException('Повреждён профиль.',503);
            motor_wallet_integer($p[41]);$profiles[$name]=$p;
        }
        return $callback($handles,$profiles);
    } finally {foreach(array_reverse($handles) as $fp){flock($fp,LOCK_UN);fclose($fp);}}
}
function motor_wallet_write($fp,string $text): void {
    rewind($fp);$done=0;$length=strlen($text);
    while($done<$length){$n=fwrite($fp,substr($text,$done));if($n===false || $n===0)throw new RuntimeException('Не удалось сохранить операцию. Повторите ту же форму.',503);$done+=$n;}
    if(!ftruncate($fp,$length) || !fflush($fp))throw new RuntimeException('Не удалось сохранить операцию. Повторите ту же форму.',503);
}
function motor_wallet_store($fp,array $p,array $state): void {
    $encoded='wallet1:'.json_encode($state,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    if(strlen($encoded)>524288)throw new RuntimeException('Лимит истории кошелька. Обратитесь к администратору.',503);
    $p=array_pad($p,100,'');$p[96]=$encoded;motor_wallet_state($p);$text=implode(':||:',$p);
    if(strlen($text)>1048576)throw new RuntimeException('Лимит размера профиля.',503);
    rewind($fp);$old=stream_get_contents($fp);
    try{motor_wallet_write($fp,$text);}catch(Throwable $e){motor_wallet_write($fp,$old);throw $e;}
}
function motor_wallet_replay(array $s,int $revision,array $request): bool {
    if($revision===$s['revision']) {
        if(!empty($s['last']['pending']))throw new RuntimeException('Сначала завершите предыдущий перевод по кнопке на странице переводов.',409);
        return false;
    }
    $last=$s['last'];
    if($last!==null && $last['revision']===$revision){foreach($request as $key=>$value)if(($last[$key]??null)!==$value)throw new RuntimeException('Форма устарела. Обновите страницу.',409);return true;}
    throw new RuntimeException('Форма устарела. Обновите страницу.',409);
}
function motor_wallet_transfer($actor,$target,$amount,$revision,int $now,string $hash): array {
    if(!motor_wallet_login($actor) || !motor_wallet_login($target))throw new RuntimeException('Недопустимый логин.',400);
    if($actor===$target)throw new RuntimeException('Нельзя переводить самому себе.',403);
    $amount=motor_wallet_integer($amount,1000000000);$revision=motor_wallet_integer($revision);
    if($amount<1)throw new RuntimeException('Сумма должна быть больше нуля.',400);
    return motor_wallet_locked([$actor,$target],function($handles,$profiles)use($actor,$target,$amount,$revision,$now,$hash){
        $a=$profiles[$actor];$b=$profiles[$target];motor_wallet_authorize($a,$hash,$now);
        $s=motor_wallet_state($a);$t=motor_wallet_state($b);$ak=motor_wallet_identity($a);$bk=motor_wallet_identity($b);
        $request=['kind'=>'transfer','target'=>$target,'target_identity'=>$bk,'amount'=>$amount];
        $replay=motor_wallet_replay($s,$revision,$request);
        if($replay && !$s['last']['pending'])return ['replay'=>true,'notify'=>false];
        if(!$replay){
            $min=motor_points_min('transfer');if((int)$a[36]<$min)throw new RuntimeException('Для перевода нужно '.$min.' баллов активности.',403);
            if((int)$a[41]<$amount)throw new RuntimeException('Недостаточно средств для перевода.',409);
            $total=motor_wallet_integer(($s['outgoing'][$bk]??0)+$amount);
            // Validate the recipient before reserving funds; neither profile is replaced.
            if(($t['incoming'][$ak]??0)!==($s['outgoing'][$bk]??0))throw new RuntimeException('История переводов не согласована. Обратитесь к администратору.',503);
            motor_wallet_integer((int)$b[41]+$amount);
            if((!isset($s['outgoing'][$bk]) && count($s['outgoing'])>=10000) || (!isset($t['incoming'][$ak]) && count($t['incoming'])>=10000))throw new RuntimeException('Лимит истории кошелька.',503);
            $a[41]=(string)((int)$a[41]-$amount);$s['revision']++;$s['outgoing'][$bk]=$total;$s['last']=$request+['revision'=>$revision,'pending'=>true];
            motor_wallet_store($handles[$actor],$a,$s);
        }
        if($s['last']['target_identity']!==$bk)throw new RuntimeException('Учётная запись получателя изменилась. Обратитесь к администратору.',409);
        $total=$s['outgoing'][$bk];$credited=$t['incoming'][$ak]??0;$delta=$total-$credited;
        if($delta<0 || ($delta!==0 && $delta!==$amount))throw new RuntimeException('История переводов не согласована. Обратитесь к администратору.',503);
        if($delta>0){$b[41]=(string)motor_wallet_integer((int)$b[41]+$delta);$t['incoming'][$ak]=$total;motor_wallet_store($handles[$target],$b,$t);}
        $s['last']['pending']=false;motor_wallet_store($handles[$actor],$a,$s);
        return ['replay'=>$replay,'notify'=>true];
    });
}
function motor_wallet_credit_rules(): string {
    global $config;return hash('sha256',json_encode([(int)$config['minkredit'],(int)$config['maxkredit'],(int)$config['percentkredit']]));
}
// Avatar purchases share the balance lock with transfers, credits and comment rewards.
function motor_wallet_avatar(string $actor,string $avatar,?string $upload,int $now,string $hash): void {
    global $config;
    motor_wallet_locked([$actor],function($handles,$profiles)use($actor,$avatar,$upload,$now,$hash,$config){
        $p=$profiles[$actor];motor_wallet_authorize($p,$hash,$now);$state=motor_wallet_state($p);
        $cost=motor_wallet_integer((int)$config[$upload===null?'avatarpay':'avatarupload']);
        $path=DATADIR.'dataavators/'.$actor.'.gif';
        if(is_link(DATADIR.'dataavators') || is_link($path) || !is_dir(DATADIR.'dataavators') || (file_exists($path) && !is_file($path)))throw new RuntimeException('Хранилище аватаров недоступно.',503);
        if($upload===null && $p[43]===$avatar)return;
        if($upload!==null){
            $min=motor_points_min('avatar_upload');if((int)$p[36]<$min)throw new RuntimeException('Для загрузки аватара нужно '.$min.' баллов активности.',403);
            if($p[43]===$avatar && is_file($path) && hash_equals(hash_file('sha256',$path),hash_file('sha256',$upload)))return;
        }
        if((int)$p[41]<$cost)throw new RuntimeException('Недостаточно средств на счету.',409);
        $backup=null;$replaced=false;
        try {
            if($upload!==null){
                if(is_file($path)){$temp=tempnam(DATADIR.'dataavators','avatar-backup-');if(!$temp)throw new RuntimeException('Не удалось сохранить прежний аватар.',503);if(!copy($path,$temp)){unlink($temp);throw new RuntimeException('Не удалось сохранить прежний аватар.',503);}$backup=$temp;}
                if(!move_uploaded_file($upload,$path))throw new RuntimeException('Не удалось загрузить аватар.',503);
                $replaced=true;@chmod($path,0660);
            }
            $p[41]=(string)((int)$p[41]-$cost);$p[43]=$avatar;motor_wallet_store($handles[$actor],$p,$state);
            if($upload===null && is_file($path))unlink($path);
        } catch(Throwable $e){if($replaced){if($backup!==null && is_file($backup))rename($backup,$path);elseif(is_file($path))unlink($path);}throw $e;}
        finally {if($backup!==null && is_file($backup))unlink($backup);}
    });
}
function motor_wallet_debt(array $p,int $now): array {
    $debt=motor_wallet_integer($p[54]??0);$overdue=$debt>0 && (int)($p[53]??0)>0 && (int)$p[53]<=$now;
    return ['debt'=>motor_wallet_integer($debt+($overdue?(int)round($debt/100):0)),'overdue'=>$overdue];
}
function motor_wallet_credit($actor,$operation,$amount,$revision,$rules,int $now,string $hash): array {
    global $config;
    if(!motor_wallet_login($actor) || !is_string($operation) || !in_array($operation,['1','2','3'],true))throw new RuntimeException('Выберите операцию.',400);
    $amount=motor_wallet_integer($amount);$revision=motor_wallet_integer($revision);
    return motor_wallet_locked([$actor],function($handles,$profiles)use($actor,$operation,$amount,$revision,$rules,$now,$hash,$config){
        $p=$profiles[$actor];motor_wallet_authorize($p,$hash,$now);$s=motor_wallet_state($p);
        $request=['kind'=>'credit','operation'=>$operation,'amount'=>$amount];
        if(motor_wallet_replay($s,$revision,$request))return ['replay'=>true];
        if(!is_string($rules) || !hash_equals(motor_wallet_credit_rules(),$rules))throw new RuntimeException('Условия кредита изменились. Обновите страницу.',409);
        $due=motor_wallet_debt($p,$now);
        if($operation==='1') {
            $min=motor_points_min('credit');if((int)$p[36]<$min)throw new RuntimeException('Для получения кредита нужно '.$min.' баллов активности.',403);
            if($due['debt']>0 || (int)$p[53]>0)throw new RuntimeException('Сначала погасите прежний кредит.',409);
            if($amount<1 || $amount<(int)$config['minkredit'] || $amount>(int)$config['maxkredit'])throw new RuntimeException('Сумма вне разрешённых границ кредита.',400);
            $percent=motor_wallet_integer((int)$config['percentkredit'],10000);
            $p[41]=(string)motor_wallet_integer((int)$p[41]+$amount);$p[53]=(string)($now+259200);$p[54]=(string)motor_wallet_integer($amount+(int)round($amount*$percent/100));
        } else {
            if($due['debt']<1)throw new RuntimeException('У вас нет задолженности.',409);
            if($operation==='2' && ($amount!==$due['debt'] || $amount>(int)$p[41]))throw new RuntimeException('Введите точную сумму долга и проверьте остаток средств.',409);
            if($operation==='3' && !$due['overdue'])throw new RuntimeException('Просроченной задолженности нет.',409);
            if($due['overdue']){foreach([36,49,51] as $f)if(!preg_match('/^-?[0-9]{1,15}$/D',(string)$p[$f]))throw new RuntimeException('Повреждён профиль.',503);$p[36]=(string)((int)$p[36]-10);$p[49]=(string)((int)$p[49]-1);$p[51]=(string)((int)$p[51]+1);$p[53]=(string)($now+86400);$p[54]=(string)$due['debt'];}
            if($operation==='2'){$p[41]=(string)((int)$p[41]-$amount);$p[53]=$p[54]='0';}
        }
        $s['revision']++;$s['last']=$request+['revision'=>$revision,'pending'=>false];motor_wallet_store($handles[$actor],$p,$s);return ['replay'=>false];
    });
}
// Called only after releasing all profile locks: mailbox -> profile is the existing order.
function motor_wallet_notify(string $actor,string $target,int $amount,int $now): void {
    global $config;
    if(!empty(search_string(DATADIR.'dataignor/'.$target.'.dat',$actor,1)))return;
    $path=DATADIR.'privat/'.$target.'.priv';if(is_link(DATADIR.'privat') || is_link($path) || !is_dir(DATADIR.'privat'))return;
    $fp=@fopen($path,'c+b');if(!$fp)return;
    try{if(!flock($fp,LOCK_EX))return;$text=$actor.'|Пользователь '.$actor.' перечислил вам '.$amount.' внутренней валюты.|'.$now."|\r\n";$stat=fstat($fp);if(!$stat || $stat['size']+strlen($text)>max(0,(int)($config['limitsmail']??0))*1024)return;fseek($fp,0,SEEK_END);if(fwrite($fp,$text)===strlen($text) && fflush($fp))increment_profil($target,[10=>1]);}
    finally{flock($fp,LOCK_UN);fclose($fp);}
}
