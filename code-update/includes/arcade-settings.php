<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }
function motor_arcade_names(): array { return ['21'=>'Двадцать одно','bandit'=>'Бандит','kosti'=>'Кости','naperstki'=>'Напёрстки']; }
function motor_arcade_defaults(): array {
    return ['21'=>['mode'=>'random','percent'=>50], 'bandit'=>['mode'=>'random','percent'=>50,'cost'=>5], 'kosti'=>['mode'=>'random','percent'=>50,'cost'=>5], 'naperstki'=>['mode'=>'random','percent'=>50,'cost'=>50]];
}
function motor_arcade_int($value,int $min,int $max): int {
    if ((!is_string($value)&&!is_int($value)) || !preg_match('/^(0|[1-9][0-9]{0,8})$/D',(string)$value) || (int)$value<$min || (int)$value>$max) throw new InvalidArgumentException('Введите целое число от '.$min.' до '.$max.'.');
    return (int)$value;
}
function motor_arcade_settings_validate(array $s): array {
    $out=[];
    foreach (motor_arcade_defaults() as $id=>$defaults) {
        $v=$s[$id]??null;
        if (!is_array($v)||!in_array($v['mode']??null,['random','percent'],true)) throw new InvalidArgumentException('Выберите допустимый режим игры.');
        $out[$id]=['mode'=>$v['mode'],'percent'=>motor_arcade_int($v['percent']??null,0,100)];
        if ($id!=='21' && $id!==21) $out[$id]['cost']=motor_arcade_int($v['cost']??null,1,100000);
    }
    return $out;
}
function motor_arcade_settings(): array {
    $path=DATADIR.'arcade-settings.json';
    if (is_link($path)) throw new RuntimeException('Настройки игр недоступны.');
    if (!file_exists($path)) return motor_arcade_defaults();
    $s=json_decode(file_get_contents($path),true,16,JSON_THROW_ON_ERROR);
    if (!is_array($s)) throw new RuntimeException('Настройки игр повреждены.');
    return motor_arcade_settings_validate($s);
}
function motor_arcade_version(array $s): string {return hash('sha256',json_encode($s,JSON_THROW_ON_ERROR));}
function motor_arcade_settings_save(array $input,string $version): array {
    $new=[];
    foreach (motor_arcade_defaults() as $id=>$defaults) {
        foreach ($defaults as $key=>$unused) $new[$id][$key]=$input[$id.'_'.$key]??null;
    }
    $new=motor_arcade_settings_validate($new);$lockPath=DATADIR.'arcade-settings.lock';
    if(is_link($lockPath))throw new RuntimeException('Настройки игр недоступны.');
    $lock=fopen($lockPath,'c+b');if(!$lock)throw new RuntimeException('Не удалось открыть настройки.');$tmp=null;
    try {
        if(!flock($lock,LOCK_EX))throw new RuntimeException('Не удалось заблокировать настройки.');
        if(!hash_equals(motor_arcade_version(motor_arcade_settings()),$version))throw new RuntimeException('Настройки уже изменены. Обновите страницу перед сохранением.',409);
        $json=json_encode($new,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
        $tmp=tempnam(DATADIR,'arcade-');if(!$tmp || file_put_contents($tmp,$json)!==strlen($json) || !chmod($tmp,0660) || !rename($tmp,DATADIR.'arcade-settings.json'))throw new RuntimeException('Не удалось сохранить настройки.');
        $tmp=null;return $new;
    } finally {if($tmp!==null&&is_file($tmp))unlink($tmp);flock($lock,LOCK_UN);fclose($lock);}
}
// An independent Bernoulli trial per round, never a promise of an exact short-run ratio.
function motor_arcade_target(array $policy): ?bool {
    return $policy['mode']==='percent'?random_int(1,100)<=$policy['percent']:null;
}
function motor_arcade_policy_label(array $policy): string {
    return $policy['mode']==='percent'?'Заданный шанс выигрыша: '.(int)$policy['percent'].'%':'Случайный режим';
}
