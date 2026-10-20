<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}

// The public page and its editor must resolve the same template.
function motor_home_template_file(string $path): string {
    if (is_link($path) || !is_file($path)) throw new RuntimeException('Шаблон главной страницы недоступен.',503);
    $text=file_get_contents($path,false,null,0,262145);
    if ($text===false || strlen($text)>262144) throw new RuntimeException('Шаблон главной страницы превышает допустимый размер.',503);
    return $text;
}
function motor_home_template_state(): array {
    if (is_link(DATADIR.'datamain') || !is_dir(DATADIR.'datamain')) throw new RuntimeException('Каталог шаблонов недоступен.',503);
    $path=DATADIR.'datamain/index.dat';$raw=motor_home_template_file($path);
    $standardPath=__DIR__.'/lesika/home.php';$standard=motor_home_template_file($standardPath);
    $legacy=hash('sha256',$raw)==='577fcd0bc84a2b4f55bade258b0d56e3d24e4bb3cf66d183aee3e903bc3e4aad';
    $contents=$legacy?$standard:$raw;
    return ['path'=>$legacy?$standardPath:$path,'raw'=>$raw,'contents'=>$contents,'standard'=>$standard,
        'builtin'=>$legacy || $raw===$standard,'version'=>hash('sha256',hash('sha256',$raw).hash('sha256',$contents))];
}
function motor_home_template_owner(): bool {
    global $config;
    if (!is_user() || ($_SESSION['log']??'')!==($config['nickname']??'')) return false;
    $p=reading_profil($_SESSION['log']);
    return (int)($p[7]??0)===101 && empty($p[37]);
}
function motor_home_template_atomic(string $path,string $contents,int $mode): void {
    $tmp=tempnam(dirname($path),'.home-template-');
    if ($tmp===false) throw new RuntimeException('Не удалось подготовить сохранение шаблона.',503);
    try {
        if (file_put_contents($tmp,$contents,LOCK_EX)!==strlen($contents) || !chmod($tmp,$mode) || !rename($tmp,$path)) throw new RuntimeException('Не удалось сохранить шаблон.',503);
        $tmp=null;
    } finally {if ($tmp!==null) @unlink($tmp);}
}
function motor_home_template_save(array $input): void {
    motor_form_guard([]);
    if (!motor_home_template_owner()) throw new RuntimeException('Редактор шаблона доступен только владельцу сайта.',403);
    $version=$input['version']??null;$operation=$input['operation']??'save';
    if (!is_string($version) || !preg_match('/^[a-f0-9]{64}$/D',$version)) throw new InvalidArgumentException('Обновите страницу редактора перед сохранением.');
    if (!in_array($operation,['save','standard'],true)) throw new InvalidArgumentException('Неизвестное действие.');
    $lock=DATADIR.'home-template.lock';
    if (is_link($lock) || (file_exists($lock) && !is_file($lock))) throw new RuntimeException('Блокировка шаблона недоступна.',503);
    $fp=fopen($lock,'c+b');if (!$fp) throw new RuntimeException('Не удалось открыть шаблон.',503);
    try {
        if (!flock($fp,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать шаблон.',503);
        $state=motor_home_template_state();
        if (!hash_equals($state['version'],$version)) throw new RuntimeException('Шаблон уже изменён. Откройте редактор заново; ваш текст оставлен в поле ниже.',409);
        $text=$operation==='standard'?$state['standard']:($input['msg']??null);
        if (!is_string($text) || trim($text)==='' || strlen($text)>262144 || !mb_check_encoding($text,'UTF-8') || str_contains($text,"\0")) throw new InvalidArgumentException('Введите шаблон в UTF-8 размером до 256 КБ.');
        try {token_get_all($text,TOKEN_PARSE);} catch (ParseError $e) {throw new InvalidArgumentException('Ошибка синтаксиса PHP в строке '.$e->getLine().'. Файл не изменён.');}
        if ($text===$state['raw'] || str_replace(["\r\n","\r"],"\n",$state['raw'])===$text) return;
        $dir=DATADIR.'home-template-backups';
        if (is_link($dir) || (file_exists($dir) && !is_dir($dir))) throw new RuntimeException('Каталог резервных копий недоступен.',503);
        if (!is_dir($dir) && !mkdir($dir,0700) && !is_dir($dir)) throw new RuntimeException('Не удалось создать каталог резервных копий.',503);
        // Keep both the stored file and the actual displayed template for the legacy default.
        foreach ([$state['raw'],$state['contents']] as $before) {
            $backup=$dir.'/'.hash('sha256',$before).'.dat';
            if (is_link($backup) || (file_exists($backup) && !is_file($backup))) throw new RuntimeException('Резервная копия недоступна.',503);
            if (is_file($backup)) {if (motor_home_template_file($backup)!==$before) throw new RuntimeException('Резервная копия повреждена. Сохранение отменено.',503);}
            else motor_home_template_atomic($backup,$before,0600);
        }
        if (!motor_home_template_owner()) throw new RuntimeException('Недостаточно прав.',403);
        $current=motor_home_template_state();
        if (!hash_equals($state['version'],$current['version'])) throw new RuntimeException('Шаблон изменился во время сохранения. Откройте редактор заново.',409);
        motor_home_template_atomic(DATADIR.'datamain/index.dat',$text,0660);
        if (function_exists('opcache_invalidate')) opcache_invalidate(DATADIR.'datamain/index.dat',true);
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
