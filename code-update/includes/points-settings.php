<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
function motor_points_labels(): array {
    return ['reputation'=>'Изменение авторитета другого пользователя','transfer'=>'Перевод внутренней валюты','credit'=>'Получение кредита','email'=>'Изменение e-mail','nickname'=>'Выбор и отображение собственного ника','avatar_upload'=>'Загрузка своего аватара','flood_newbie'=>'До этого количества баллов: пауза антифлуда ×2','flood_half'=>'От этого количества баллов: пауза антифлуда ÷2','flood_third'=>'От этого количества баллов: пауза антифлуда ÷3','flood_sixth'=>'От этого количества баллов: пауза антифлуда ÷6'];
}
function motor_points_defaults(): array {
    global $config;
    return ['reputation'=>150,'transfer'=>150,'credit'=>150,'email'=>150,'nickname'=>150,'avatar_upload'=>max(0,min(1000000,(int)($config['avatarpoints']??150))),'flood_newbie'=>50,'flood_half'=>500,'flood_third'=>1000,'flood_sixth'=>5000];
}
function motor_points_validate(array $input): array {
    $out=[];
    foreach (motor_points_labels() as $key=>$label) {
        $v=$input[$key]??null;
        if ((!is_string($v) && !is_int($v)) || !preg_match('/^(0|[1-9][0-9]{0,6})$/D',(string)$v) || (int)$v>1000000) throw new InvalidArgumentException($label.': введите целое число от 0 до 1000000.');
        $out[$key]=(int)$v;
    }
    if (!($out['flood_newbie']<$out['flood_half'] && $out['flood_half']<$out['flood_third'] && $out['flood_third']<$out['flood_sixth'])) throw new InvalidArgumentException('Пороги антифлуда должны строго возрастать.');
    return $out;
}
function motor_points_settings(): array {
    $path=DATADIR.'points-settings.json';
    if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Настройки баллов недоступны.',503);
    if (!file_exists($path)) return motor_points_defaults();
    $raw=file_get_contents($path,false,null,0,16385);if ($raw===false || strlen($raw)>16384) throw new RuntimeException('Настройки баллов повреждены.',503);
    try {$data=json_decode($raw,true,8,JSON_THROW_ON_ERROR);if (!is_array($data)) throw new RuntimeException();return motor_points_validate($data);}
    catch (Throwable $e) {throw new RuntimeException('Настройки баллов повреждены. Обратитесь к администратору.',503);}
}
function motor_points_min(string $key): int {
    if (!array_key_exists($key,motor_points_labels())) throw new InvalidArgumentException('Неизвестный порог.');
    return motor_points_settings()[$key];
}
function motor_points_version(array $s): string {return hash('sha256',json_encode($s,JSON_THROW_ON_ERROR));}
function motor_points_save(array $input): array {
    $next=motor_points_validate($input);$version=$input['version']??null;
    if (!is_string($version) || !preg_match('/^[a-f0-9]{64}$/D',$version)) throw new InvalidArgumentException('Обновите форму настроек.');
    $path=DATADIR.'points-settings.lock';if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Настройки баллов недоступны.',503);
    $fp=fopen($path,'c');if (!$fp) throw new RuntimeException('Не удалось открыть настройки.',503);$tmp=null;
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать настройки.',503);
        if (!hash_equals(motor_points_version(motor_points_settings()),$version)) throw new RuntimeException('Настройки уже изменены. Обновите страницу перед сохранением.',409);
        $json=json_encode($next,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
        $tmp=tempnam(DATADIR,'points-');if (!$tmp || file_put_contents($tmp,$json)!==strlen($json) || !chmod($tmp,0660) || !rename($tmp,DATADIR.'points-settings.json')) throw new RuntimeException('Не удалось сохранить настройки.',503);
        $tmp=null;return $next;
    } finally {if ($tmp!==null && is_file($tmp)) unlink($tmp);flock($fp,LOCK_UN);fclose($fp);}
}
