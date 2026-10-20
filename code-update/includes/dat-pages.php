<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
require_once __DIR__.'/home-template.php';
function motor_dat_escape(string $text): string {return htmlspecialchars($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function motor_dat_catalog(): array {
    return [
        'index.dat'=>['Главная: карточки разделов','index.php','Главная страница'],
        'menu.dat'=>['Моё меню','pages/index.php?action=menu','Меню вошедшего пользователя'],
        'arkada.dat'=>['Игры и развлечения','games/index.php','Каталог игр и развлечений'],
        'info.dat'=>['Информация','pages/index.php?action=info','Информационные ссылки'],
        'statistik.dat'=>['Статистика','pages/index.php?action=statistik','Ссылки на статистику и рейтинги'],
        'partners.dat'=>['Партнёры','pages/index.php?action=partners','Партнёры и друзья сайта'],
        'buttons.dat'=>['Наши кнопки','pages/index.php?action=buttons','Кнопки и баннеры сайта'],
        'test.dat'=>['Тестирование сайта','pages/index.php?action=test','Тестовая информационная страница'],
        'reklama_head.dat'=>['Реклама сверху','index.php#motor-ad-head','Верхний рекламный блок всех страниц'],
        'reklama_foot.dat'=>['Реклама снизу','index.php#motor-ad-foot','Нижний рекламный блок всех страниц'],
    ];
}
function motor_dat_path(string $file): string {
    if (!preg_match('/^[a-zA-Z0-9_-]{1,64}\.dat$/D',$file)) throw new InvalidArgumentException('Недопустимое имя файла .dat.');
    if (is_link(DATADIR.'datamain') || !is_dir(DATADIR.'datamain')) throw new RuntimeException('Каталог страниц недоступен.',503);
    $path=DATADIR.'datamain/'.$file;
    if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Файл страницы недоступен.',503);
    return $path;
}
function motor_dat_state(string $file): array {
    $path=motor_dat_path($file);
    if (!is_file($path)) throw new RuntimeException('Страница не найдена.',404);
    if ($file==='index.dat') return motor_home_template_state();
    $raw=motor_home_template_file($path);
    return ['path'=>$path,'raw'=>$raw,'contents'=>$raw,'version'=>hash('sha256',$file."\0".$raw)];
}
function motor_dat_info(string $file): array {
    motor_dat_path($file);
    return motor_dat_catalog()[$file]??[$file,'pages/index.php?action='.rawurlencode(substr($file,0,-4)),'Дополнительная страница'];
}
function motor_dat_backup(string $file,string $raw): void {
    $root=DATADIR.'datamain-backups';$dir=$root.'/'.$file;
    foreach ([$root,$dir] as $p) {
        if (is_link($p) || (file_exists($p) && !is_dir($p))) throw new RuntimeException('Каталог резервных копий недоступен.',503);
        if (!is_dir($p) && !mkdir($p,0700) && !is_dir($p)) throw new RuntimeException('Не удалось создать резервную копию.',503);
    }
    $path=$dir.'/'.hash('sha256',$raw).'.dat';
    if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Резервная копия недоступна.',503);
    if (is_file($path)) {if (motor_home_template_file($path)!==$raw) throw new RuntimeException('Резервная копия повреждена.',503);}
    else motor_home_template_atomic($path,$raw,0600);
}
function motor_dat_change(string $file,string $operation,array $input): void {
    motor_form_guard([]);
    if (!motor_home_template_owner()) throw new RuntimeException('Редактор доступен только владельцу сайта.',403);
    if (!in_array($operation,['save','create','delete'],true) || $file==='index.dat') throw new InvalidArgumentException('Используйте соответствующий редактор страницы.');
    $path=motor_dat_path($file);$lock=DATADIR.'datamain-editor.lock';
    if (is_link($lock) || (file_exists($lock) && !is_file($lock))) throw new RuntimeException('Блокировка страниц недоступна.',503);
    $fp=fopen($lock,'c+b');if (!$fp) throw new RuntimeException('Не удалось открыть редактор.',503);
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать страницу.',503);
        $path=motor_dat_path($file);
        if ($operation==='create') {
            if (file_exists($path)) throw new RuntimeException('Такой файл уже существует.',409);
            // Exclusive create also preserves a file created outside this editor.
            $created=fopen($path,'x+b');if (!$created) throw new RuntimeException('Не удалось создать страницу.',503);
            fclose($created);chmod($path,0660);return;
        }
        $state=motor_dat_state($file);$version=$input['version']??null;
        if (!is_string($version) || !hash_equals($state['version'],$version)) throw new RuntimeException('Файл уже изменён. Откройте редактор заново; ваш текст оставлен ниже.',409);
        if ($operation==='delete') {
            if (isset(motor_dat_catalog()[$file])) throw new InvalidArgumentException('Системную страницу нельзя удалить. Её содержимое можно изменить или очистить.');
            motor_dat_backup($file,$state['raw']);
            if (!hash_equals(motor_dat_state($file)['version'],$state['version']) || !unlink($path)) throw new RuntimeException('Не удалось удалить страницу.',503);
        } else {
            $text=$input['msg']??null;
            if (!is_string($text) || strlen($text)>262144 || !mb_check_encoding($text,'UTF-8') || str_contains($text,"\0")) throw new InvalidArgumentException('Введите текст UTF-8 размером до 256 КБ.');
            try {token_get_all($text,TOKEN_PARSE);} catch(ParseError $e) {throw new InvalidArgumentException('Ошибка синтаксиса PHP в строке '.$e->getLine().'. Файл не изменён.');}
            if ($text===$state['raw'] || str_replace(["\r\n","\r"],"\n",$state['raw'])===$text) return;
            motor_dat_backup($file,$state['raw']);
            if (!motor_home_template_owner()) throw new RuntimeException('Недостаточно прав.',403);
            if (!hash_equals(motor_dat_state($file)['version'],$state['version'])) throw new RuntimeException('Файл изменился во время сохранения.',409);
            motor_home_template_atomic($path,$text,0660);
        }
        if (function_exists('opcache_invalidate')) opcache_invalidate($path,true);
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
