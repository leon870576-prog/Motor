<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
require_once __DIR__.'/portal-brand.php';

function motor_bottom_targets(): array {
    return [
        'home'=>['Главная','index.php'],'news'=>['Новости','news/index.php'],
        'forum'=>['Форум','forum/index.php'],'book'=>['Гостевая','book/index.php'],
        'themes'=>['Темы оформления','pages/themes.php'],'chat'=>['Мини-чат','chat/index.php'],
        'gallery'=>['Фотогалерея','gallery/index.php'],'board'=>['Объявления','board/index.php'],
        'people'=>['Жители','pages/userlist.php'],'profile'=>['Моя страница','pages/userpage.php'],
        'menu'=>['Моё меню','pages/index.php?action=menu'],'games'=>['Игры','games/index.php'],
        'statistics'=>['Статистика','pages/index.php?action=statistik'],
        'info'=>['Информация','pages/index.php?action=info'],'partners'=>['Партнёры','pages/index.php?action=partners'],
        'buttons'=>['Наши кнопки','pages/index.php?action=buttons'],
        'team'=>['Администрация','pages/adminlist.php'],'polls'=>['Голосования','votes/index.php']
    ];
}
function motor_bottom_icons(): array {return ['home'=>'Дом','news'=>'Новости','forum'=>'Сообщения','guest'=>'Сердце','theme'=>'Палитра','user'=>'Пользователь','image'=>'Фотография','pin'=>'Метка','menu'=>'Список','arrow'=>'Стрелка'];}
function motor_bottom_defaults(): array {
    $items=[];
    foreach ([['home','home','Главная'],['news','news','Новости'],['forum','forum','Форум'],['book','guest','Гостевая'],['themes','theme','Темы']] as $i=>[$target,$icon,$label]) $items[]=['id'=>(string)($i+1),'enabled'=>true,'label'=>$label,'target'=>$target,'icon'=>$icon];
    return ['revision'=>'initial','enabled'=>true,'items'=>$items];
}
function motor_bottom_label(mixed $value): string {
    if (!is_string($value) || strlen($value)>96 || !mb_check_encoding($value,'UTF-8') || preg_match('/\p{C}/u',$value) || trim($value)==='' || mb_strlen(trim($value))>24) throw new InvalidArgumentException('Название пункта: от 1 до 24 символов в одну строку.');
    return trim($value);
}
function motor_bottom_valid(array $s): array {
    if (!isset($s['revision'],$s['enabled'],$s['items']) || !is_string($s['revision']) || !preg_match('/^(?:initial|[a-f0-9]{32})$/D',$s['revision']) || !is_bool($s['enabled']) || !is_array($s['items']) || !array_is_list($s['items']) || count($s['items'])!==5) throw new RuntimeException('Настройки нижнего меню повреждены.',503);
    $ids=[];
    foreach ($s['items'] as $item) {
        if (!is_array($item) || !isset($item['id'],$item['enabled'],$item['label'],$item['target'],$item['icon']) || !is_string($item['id']) || !preg_match('/^[1-5]$/D',$item['id']) || isset($ids[$item['id']]) || !is_bool($item['enabled']) || !is_string($item['target']) || !isset(motor_bottom_targets()[$item['target']]) || !is_string($item['icon']) || !isset(motor_bottom_icons()[$item['icon']])) throw new RuntimeException('Настройки нижнего меню повреждены.',503);
        if (motor_bottom_label($item['label'])!==$item['label']) throw new RuntimeException('Неверное название пункта меню.',503);
        $ids[$item['id']]=true;
    }
    return $s;
}
function motor_bottom_settings(): array {
    $path=DATADIR.'bottom-menu.json';
    if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Настройки нижнего меню недоступны.',503);
    if (!file_exists($path)) return motor_bottom_defaults();
    $raw=file_get_contents($path,false,null,0,16385);
    if ($raw===false || strlen($raw)>16384) throw new RuntimeException('Настройки нижнего меню повреждены.',503);
    try {$s=json_decode($raw,true,8,JSON_THROW_ON_ERROR);if(!is_array($s))throw new RuntimeException();return motor_bottom_valid($s);}
    catch(Throwable $e){throw new RuntimeException('Настройки нижнего меню повреждены. Восстановите их из резервной копии.',503);}
}
function motor_bottom_version(array $s): string {return hash('sha256',json_encode($s,JSON_THROW_ON_ERROR));}
function motor_bottom_items(array $s): array {return $s['enabled']?array_values(array_filter($s['items'],fn($item)=>$item['enabled'])):[];}
function motor_bottom_save(array $input): void {
    motor_form_guard([]);
    if (!motor_brand_owner()) throw new RuntimeException('Редактирование нижнего меню доступно только владельцу сайта.',403);
    $version=$input['version']??null;$operation=$input['operation']??null;
    if (!is_string($version) || !preg_match('/^[a-f0-9]{64}$/D',$version) || !in_array($operation,['save','defaults'],true)) throw new InvalidArgumentException('Обновите форму настроек.');
    $lock=DATADIR.'bottom-menu.lock';
    if (is_link($lock) || (file_exists($lock) && !is_file($lock))) throw new RuntimeException('Не удалось открыть настройки нижнего меню.',503);
    $fp=fopen($lock,'c+b');if(!$fp)throw new RuntimeException('Не удалось открыть настройки.',503);$tmp=null;
    try {
        if(!flock($fp,LOCK_EX))throw new RuntimeException('Не удалось заблокировать настройки.',503);
        $current=motor_bottom_settings();if(!hash_equals(motor_bottom_version($current),$version))throw new RuntimeException('Меню уже изменено. Обновите форму перед сохранением.',409);
        $s=motor_bottom_defaults();
        if($operation==='save') {
            if(!in_array($input['enabled']??null,['0','1'],true))throw new InvalidArgumentException('Выберите, показывать ли нижнее меню.');
            $s['enabled']=$input['enabled']==='1';$ordered=[];
            foreach($s['items'] as $item) {
                $id=$item['id'];$n=$input['position_'.$id]??null;
                if(!is_string($n)||!preg_match('/^[1-5]$/D',$n)||isset($ordered[$n]))throw new InvalidArgumentException('У каждого пункта должен быть свой номер от 1 до 5.');
                $enabled=$input['enabled_'.$id]??null;$target=$input['target_'.$id]??null;$icon=$input['icon_'.$id]??null;
                if(!in_array($enabled,['0','1'],true)||!is_string($target)||!isset(motor_bottom_targets()[$target])||!is_string($icon)||!isset(motor_bottom_icons()[$icon]))throw new InvalidArgumentException('Выберите раздел, значок и видимость пункта.');
                $ordered[$n]=['id'=>$id,'enabled'=>$enabled==='1','label'=>motor_bottom_label($input['label_'.$id]??null),'target'=>$target,'icon'=>$icon];
            }
            ksort($ordered);$s['items']=array_values($ordered);
        }
        if(!motor_brand_owner())throw new RuntimeException('Недостаточно прав.',403);
        $s['revision']=bin2hex(random_bytes(16));motor_bottom_valid($s);
        $json=json_encode($s,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
        $tmp=tempnam(DATADIR,'bottom-menu-');
        if($tmp===false||file_put_contents($tmp,$json)!==strlen($json)||!chmod($tmp,0660)||!rename($tmp,DATADIR.'bottom-menu.json'))throw new RuntimeException('Не удалось сохранить нижнее меню.',503);
        $tmp=null;
    } finally {if($tmp!==null)@unlink($tmp);flock($fp,LOCK_UN);fclose($fp);}
}
function motor_bottom_active(string $target,string $route,array $query): bool {
    $url=motor_bottom_targets()[$target][1];$path=strtok($url,'?');
    if(str_contains($url,'?')){parse_str(parse_url($url,PHP_URL_QUERY),$expected);return $route===$path && ($query['action']??'')===$expected['action'];}
    if(str_starts_with($path,'pages/') || $path==='index.php')return $route===$path;
    return str_starts_with($route,dirname($path).'/');
}
function motor_bottom_render(array $s,bool $preview=false): void {
    $items=motor_bottom_items($s);if(!$items){if($preview)echo '<p>Нижнее меню выключено или все пункты скрыты.</p>';return;}
    echo '<nav class="'.($preview?'bottom-menu-preview':'bottom-nav').' bottom-menu-items" aria-label="'.($preview?'Предпросмотр нижнего меню':'Быстрые переходы').'" style="grid-template-columns:repeat('.count($items).',minmax(0,1fr))">';
    $route=motor_request_route();
    foreach($items as $item){$href=motor_bottom_targets()[$item['target']][1];$label=motor_brand_escape($item['label']);echo '<a href="'.motor_brand_escape(BASEDIR.$href).'" title="'.$label.'" aria-label="'.$label.'"'.(!$preview&&motor_bottom_active($item['target'],$route,$_GET)?' aria-current="page"':'').'>'.lesika_icon($item['icon']).'<span>'.$label.'</span></a>';}
    echo '</nav>';
}
