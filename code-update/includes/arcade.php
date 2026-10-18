<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
require_once __DIR__.'/arcade-settings.php';
function motor_arcade_empty(): array {return ['v'=>1,'revision'=>'0','games'=>[]];}
function motor_arcade_decode(string $raw): array {
    if ($raw===''||$raw==='0')return motor_arcade_empty();
    if(!str_starts_with($raw,'arc1:')||strlen($raw)>32768)throw new RuntimeException('Не удалось прочитать игры.');
    $s=json_decode(substr($raw,5),true,32,JSON_THROW_ON_ERROR);
    if(!is_array($s)||($s['v']??null)!==1||!is_string($s['revision']??null)||!preg_match('/^[a-f0-9]{32}$/D',$s['revision'])||!is_array($s['games']??null))throw new RuntimeException('Состояние игры повреждено.');
    foreach($s['games'] as $id=>$g){
        if(!in_array($id,['bandit','kosti','naperstki'],true)||!is_array($g)||!in_array($g['status']??null,['won','lost','draw'],true)||!is_int($g['cost']??null)||$g['cost']<1||$g['cost']>100000||!is_int($g['payout']??null)||$g['payout']<0||!is_int($g['rounds']??null)||!is_int($g['wins']??null))throw new RuntimeException('Состояние игры повреждено.');
        if(!is_array($g['policy']??null)||!in_array($g['policy']['mode']??null,['random','percent'],true)||!is_int($g['policy']['percent']??null)||$g['policy']['percent']<0||$g['policy']['percent']>100)throw new RuntimeException('Правила партии повреждены.');
        if($id==='bandit'){$values=$g['grid']??[];$length=9;$max=8;}
        elseif($id==='kosti'){$values=$g['dice']??[];$length=4;$max=6;}
        else {$values=[$g['choice']??null,$g['ball']??null];$length=2;$max=3;}
        if(!is_array($values)||count($values)!==$length)throw new RuntimeException('Результат игры повреждён.');
        foreach($values as $n)if(!is_int($n)||$n<1||$n>$max)throw new RuntimeException('Результат игры повреждён.');
    }
    return $s;
}
function motor_arcade_slot_lines(): array {
    return [
        ['Верхний ряд',[0,1,2],[5,10,15,25,30,50,177,60]],
        ['Средний ряд',[3,4,5],[10,15,25,35,50,70,777,100]],
        ['Нижний ряд',[6,7,8],[5,10,15,25,30,55,177,60]],
        ['Левый столбец',[0,3,6],[5,10,15,25,40,75,100,60]],
        ['Средний столбец',[1,4,7],[10,15,25,40,75,100,177,100]],
        ['Правый столбец',[2,5,8],[5,10,15,25,40,75,100,60]],
        ['Диагональ ↘',[0,4,8],[5,10,15,25,50,100,250,150]],
        ['Диагональ ↙',[2,4,6],[5,10,15,25,50,100,250,150]]
    ];
}
function motor_arcade_slot_score(array $grid,int $cost): array {
    $sum=0;$lines=[];
    foreach(motor_arcade_slot_lines() as [$name,$cells,$pays])if($grid[$cells[0]]===$grid[$cells[1]]&&$grid[$cells[1]]===$grid[$cells[2]]){
        $pay=intdiv($pays[$grid[$cells[0]]-1]*$cost,5);$sum+=$pay;$lines[]=['name'=>$name,'cells'=>$cells,'payout'=>$pay];
    }
    return ['payout'=>$sum,'lines'=>$lines];
}
function motor_arcade_slots(int $cost,?bool $target): array {
    for($i=0;$i<512;$i++){
        $grid=[];for($j=0;$j<9;$j++)$grid[]=random_int(1,8);
        $score=motor_arcade_slot_score($grid,$cost);
        if($target===null || ($score['payout']>$cost)===$target)return ['grid'=>$grid,'payout'=>$score['payout']];
    }
    // Bounded fallback; keep the chosen outcome even with an exceptionally long rejection run.
    $grid=$target?[2,2,2,3,4,5,6,7,8]:[1,2,3,4,5,6,7,8,1];
    return ['grid'=>$grid,'payout'=>motor_arcade_slot_score($grid,$cost)['payout']];
}
function motor_arcade_dice(?bool $target): array {
    if($target===null)return [random_int(1,6),random_int(1,6),random_int(1,6),random_int(1,6)];
    static $pools=null;
    if($pools===null){$pools=[[],[]];for($a=1;$a<=6;$a++)for($b=1;$b<=6;$b++)for($c=1;$c<=6;$c++)for($d=1;$d<=6;$d++)$pools[(int)($a+$b>$c+$d)][]=[$a,$b,$c,$d];}
    $pool=$pools[(int)$target];return $pool[random_int(0,count($pool)-1)];
}
function motor_arcade_round(string $id,array $policy,int $choice=0): array {
    $cost=$policy['cost'];$target=motor_arcade_target($policy);
    if($id==='bandit')$r=motor_arcade_slots($cost,$target);
    elseif($id==='kosti'){$dice=motor_arcade_dice($target);$difference=$dice[0]+$dice[1]-$dice[2]-$dice[3];$r=['dice'=>$dice,'payout'=>$difference>0?$cost*3:($difference===0?$cost:0)];}
    elseif($id==='naperstki'){
        if($choice<1||$choice>3)throw new InvalidArgumentException('Выберите один из трёх напёрстков.');
        $others=array_values(array_diff([1,2,3],[$choice]));$ball=$target===null?random_int(1,3):($target?$choice:$others[random_int(0,1)]);
        $r=['choice'=>$choice,'ball'=>$ball,'payout'=>$ball===$choice?$cost*3:0];
    }else throw new InvalidArgumentException('Неизвестная игра.');
    return $r+['cost'=>$cost,'policy'=>$policy,'status'=>$r['payout']>$cost?'won':($r['payout']===$cost?'draw':'lost')];
}
function motor_arcade_snapshot(string $login): array {
    $d=reading_profil($login);if(($d[0]??'')!==$login)throw new RuntimeException('Профиль не найден.');
    return ['state'=>motor_arcade_decode((string)($d[98]??'')),'balance'=>max(0,(int)($d[41]??0))];
}
function motor_arcade_apply(string $login,string $id,string $revision,string $rulesRevision,string $choice): array {
    if(!preg_match('/^[a-z0-9_-]{1,20}$/Di',$login)||!in_array($id,['bandit','kosti','naperstki'],true))throw new InvalidArgumentException('Неверная игра или пользователь.');
    $pick=$id==='naperstki'?motor_arcade_int($choice,1,3):0;
    $path=DATADIR.'profil/'.$login.'.prof';if(!is_file($path)||is_link($path))throw new RuntimeException('Профиль недоступен.');
    $fp=fopen($path,'r+b');if(!$fp)throw new RuntimeException('Профиль недоступен.');
    try{
        if(!flock($fp,LOCK_EX))throw new RuntimeException('Не удалось сохранить игру.');
        $d=explode(':||:',stream_get_contents($fp));
        if(($d[0]??'')!==$login||empty($d[1])||empty($d[4])||count($d)<100)throw new RuntimeException('Профиль повреждён.');
        $s=motor_arcade_decode((string)$d[98]);$balance=max(0,(int)$d[41]);$settings=motor_arcade_settings();$policy=$settings[$id];
        $reply=fn(int $code,string $message)=>['state'=>$s,'balance'=>$balance,'code'=>$code,'message'=>$message];
        if(!hash_equals($s['revision'],$revision))return $reply(409,'Показан актуальный результат: эта форма уже была использована.');
        if(!hash_equals(motor_arcade_version($settings),$rulesRevision))return $reply(409,'Администратор изменил условия. Проверьте новую стоимость и режим перед игрой.');
        if($balance<$policy['cost'])return $reply(400,'Недостаточно чатлов для новой партии.');
        $r=motor_arcade_round($id,$policy,$pick);$previous=$s['games'][$id]??[];
        $r['rounds']=($previous['rounds']??0)+1;$r['wins']=($previous['wins']??0)+(int)($r['status']==='won');
        $balance=$balance-$r['cost']+$r['payout'];if(!is_int($balance)||$balance<0)throw new RuntimeException('Баланс вне допустимого диапазона.');
        $s['games'][$id]=$r;$s['revision']=bin2hex(random_bytes(16));$d[41]=(string)$balance;$d[98]='arc1:'.json_encode($s,JSON_THROW_ON_ERROR);
        $text=implode(':||:',array_slice($d,0,100)).':||:';rewind($fp);
        if(fwrite($fp,$text)!==strlen($text)||!ftruncate($fp,strlen($text))||!fflush($fp))throw new RuntimeException('Не удалось сохранить результат. Обновите страницу.');
        return ['state'=>$s,'balance'=>$balance,'code'=>200,'message'=>''];
    }finally{flock($fp,LOCK_UN);fclose($fp);}
}
