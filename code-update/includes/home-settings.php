<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}

function motor_home_sections(): array {
    return ['news'=>['Новости','news/index.php'],'gallery'=>['Фото из галереи','gallery/index.php'],'forum'=>['Темы форума','forum/index.php'],'board'=>['Объявления','board/index.php'],'chat'=>['Мини-чат','chat/index.php'],'book'=>['Гостевая','book/index.php']];
}
function motor_home_admin(): bool {
    if (!is_user()) return false;
    $p=reading_profil($_SESSION['log']);
    return in_array((int)($p[7]??0),[101,102],true) && empty($p[37]);
}
function motor_home_defaults(): array {
    $blocks=[];
    foreach (motor_home_sections() as $key=>$label) $blocks[$key]=['count'=>$key==='board'?4:3,'mode'=>$key==='board'?'selected':'latest','selected'=>[]];
    return ['revision'=>'initial','order'=>array_keys($blocks),'blocks'=>$blocks];
}
function motor_home_valid_settings(array $s): array {
    $keys=array_keys(motor_home_sections());
    if (!isset($s['revision'],$s['order'],$s['blocks']) || !is_string($s['revision']) || !preg_match('/^(?:initial|[a-f0-9]{32})$/D',$s['revision']) || !is_array($s['order']) || !array_is_list($s['order']) || count($s['order'])!==6 || count(array_filter($s['order'],'is_string'))!==6 || count(array_unique($s['order']))!==6 || array_diff($keys,$s['order']) || !is_array($s['blocks']) || count($s['blocks'])!==6) throw new RuntimeException('Настройки главной страницы повреждены.',503);
    foreach ($keys as $key) {
        $b=$s['blocks'][$key]??null;
        if (!is_array($b) || !isset($b['count'],$b['mode'],$b['selected']) || !is_int($b['count']) || $b['count']<0 || $b['count']>20 || !in_array($b['mode'],['latest','oldest','selected'],true) || !is_array($b['selected']) || !array_is_list($b['selected']) || count($b['selected'])>20) throw new RuntimeException('Настройки главной страницы повреждены.',503);
        foreach ($b['selected'] as $id) if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_.:-]{1,160}$/D',$id)) throw new RuntimeException('Неверная подборка главной страницы.',503);
        if (count(array_unique($b['selected']))!==count($b['selected'])) throw new RuntimeException('В подборке повторяются записи.',503);
    }
    return $s;
}
function motor_home_settings(): array {
    $path=DATADIR.'home-settings.json';
    if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Настройки главной страницы недоступны.',503);
    if (!file_exists($path)) return motor_home_defaults();
    $raw=file_get_contents($path,false,null,0,65537);
    if ($raw===false || strlen($raw)>65536) throw new RuntimeException('Настройки главной страницы повреждены.',503);
    try {$s=json_decode($raw,true,12,JSON_THROW_ON_ERROR);if (!is_array($s)) throw new RuntimeException();return motor_home_valid_settings($s);}
    catch(Throwable $e) {throw new RuntimeException('Настройки главной страницы повреждены. Восстановите их из резервной копии.',503);}
}
function motor_home_version(array $s): string {return hash('sha256',json_encode($s,JSON_THROW_ON_ERROR));}
function motor_home_integer($v,int $min,int $max): int {
    if ((!is_int($v) && !is_string($v)) || !preg_match('/^(0|[1-9][0-9]{0,2})$/D',(string)$v) || (int)$v<$min || (int)$v>$max) throw new InvalidArgumentException('Введите целое число от '.$min.' до '.$max.'.');
    return (int)$v;
}
function motor_home_save(array $input): array {
    motor_form_guard([]);
    if (!motor_home_admin()) throw new RuntimeException('Настройки доступны только администраторам.',403);
    $version=$input['version']??null;
    if (!is_string($version) || !preg_match('/^[a-f0-9]{64}$/D',$version)) throw new InvalidArgumentException('Обновите форму настроек.');
    $lock=DATADIR.'home-settings.lock';
    if (is_link($lock) || (file_exists($lock) && !is_file($lock))) throw new RuntimeException('Не удалось открыть настройки.',503);
    $fp=fopen($lock,'c+b');if (!$fp) throw new RuntimeException('Не удалось открыть настройки.',503);$tmp=null;
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать настройки.',503);
        $s=motor_home_settings();
        if (!hash_equals(motor_home_version($s),$version)) throw new RuntimeException('Настройки уже изменены. Обновите страницу перед сохранением.',409);
        if (($input['operation']??'')==='select') {
            $kind=$input['block']??null;$id=$input['record']??null;
            if (!is_string($kind) || !isset(motor_home_sections()[$kind]) || !is_string($id) || strlen($id)>160) throw new InvalidArgumentException('Неверная запись.');
            require_once __DIR__.'/home-content.php';
            $found=false;foreach (motor_home_catalog($kind) as $item) if ($item['id']===$id) {$found=true;break;}
            if (!$found) throw new RuntimeException('Запись удалена, скрыта или больше недоступна. Обновите список.',409);
            if (in_array($id,$s['blocks'][$kind]['selected'],true)) return $s;
            if (count($s['blocks'][$kind]['selected'])>=20) throw new InvalidArgumentException('В подборке уже 20 записей. Сначала уберите лишние.');
            $s['blocks'][$kind]['selected'][]=$id;$s['blocks'][$kind]['mode']='selected';
        } elseif (($input['operation']??'')==='settings') {
            $positions=[];
            foreach ($s['blocks'] as $kind=>$b) {
                $n=motor_home_integer($input['position_'.$kind]??null,1,6);
                if (isset($positions[$n])) throw new InvalidArgumentException('У каждого блока должен быть свой номер порядка от 1 до 6.');
                $positions[$n]=$kind;$b['count']=motor_home_integer($input['count_'.$kind]??null,0,20);
                $mode=$input['mode_'.$kind]??null;if (!in_array($mode,['latest','oldest','selected'],true)) throw new InvalidArgumentException('Выберите режим вывода записей.');
                $b['mode']=$mode;$ordered=[];
                foreach ($b['selected'] as $i=>$id) {
                    $remove=$input['remove_'.$kind.'_'.$i]??'0';if (!in_array($remove,['0','1'],true)) throw new InvalidArgumentException('Некорректный выбор записи.');
                    if ($remove==='1') continue;
                    $rank=motor_home_integer($input['rank_'.$kind.'_'.$i]??null,1,20);
                    if (isset($ordered[$rank])) throw new InvalidArgumentException('Порядок выбранных записей в одном блоке не должен повторяться.');
                    $ordered[$rank]=$id;
                }
                ksort($ordered);$b['selected']=array_values($ordered);$s['blocks'][$kind]=$b;
            }
            ksort($positions);$s['order']=array_values($positions);
        } else throw new InvalidArgumentException('Неизвестное действие.');
        if (!motor_home_admin()) throw new RuntimeException('Недостаточно прав для сохранения.',403);
        $s['revision']=bin2hex(random_bytes(16));motor_home_valid_settings($s);
        $json=json_encode($s,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
        $tmp=tempnam(DATADIR,'home-');
        if ($tmp===false || file_put_contents($tmp,$json)!==strlen($json) || !chmod($tmp,0660) || !rename($tmp,DATADIR.'home-settings.json')) throw new RuntimeException('Не удалось сохранить настройки.',503);
        $tmp=null;return $s;
    } finally {if ($tmp!==null) @unlink($tmp);flock($fp,LOCK_UN);fclose($fp);}
}
