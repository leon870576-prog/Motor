<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}

// Convert only the former portal branding and original demo metadata.
// Account details, theme IDs, custom descriptions and all other settings survive.
function motor_portal_brand_fields(array $fields): array {
    $defaults=[
        11=>['VISAVI.NET'=>'Лесозаводск','Лесика'=>'Лесозаводск'],
        12=>['Приветствую всех на моем сайте'=>'Добро пожаловать на портал Лесозаводска','Добро пожаловать на сайт Лесика'=>'Добро пожаловать на портал Лесозаводска'],
        82=>['Visavi.net,скрипты,форум,wap,мастер,рейтинг,учебники,статьи'=>'Лесозаводск, Приморский край, Россия, городской портал, новости, общение'],
        83=>['Visavi.net - Мир скриптов - Самая большая коллекция wap-скриптов'=>'Лесозаводск — городской портал. Приморский край, Россия. Новости и общение жителей.']
    ];
    foreach ($defaults as $index=>$replacements) {
        if (!isset($fields[$index]) || !is_string($fields[$index])) continue;
        $fields[$index]=$replacements[$fields[$index]]??str_replace(['Лесика','Лесики','Лесику'],['Лесозаводск','Лесозаводска','Лесозаводск'],$fields[$index]);
    }
    $logo=(string)($fields[15]??'');
    if ($logo==='' || preg_match('~(?:^|/)(?:assets/lesika/leaf\.svg|images/img/wap-motor\.gif)$~D',$logo)) {
        $home=(string)($fields[14]??'');
        $fields[15]=(preg_match('~^https?://~i',$home)?rtrim($home,'/').'/':'').'assets/lesika/lesozavodsk.svg';
    }
    return $fields;
}
function motor_portal_brand_config(array $config): array {
    $keys=[11=>'title',12=>'logos',14=>'home',15=>'logotip',82=>'keywords',83=>'description'];$fields=[];
    foreach ($keys as $index=>$key) if (isset($config[$key])) $fields[$index]=$config[$key];
    $converted=motor_portal_brand_fields($fields);
    // Old demo defaults are resolved before installation; saved custom titles are never renamed.
    if (in_array($fields[11]??'',['VISAVI.NET','Лесика'],true)) $converted=motor_portal_online_fields($converted);
    foreach ($converted as $index=>$value) $config[$keys[$index]]=$value;
    $config['title']=motor_brand_escape(motor_brand_decode((string)($config['title']??'Лесозаводск онлайн')));
    return $config;
}

function motor_portal_online_fields(array $fields): array {
    if (($fields[11]??'')==='Лесозаводск') $fields[11]='Лесозаводск онлайн';
    if (($fields[12]??'')==='Добро пожаловать на портал Лесозаводска') $fields[12]='Приморский край · Россия';
    return $fields;
}
function motor_brand_decode(string $value): string {return html_entity_decode($value,ENT_QUOTES|ENT_HTML5,'UTF-8');}
function motor_brand_escape(string $value): string {return str_replace(['|','%'],['&#124;','&#37;'],htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'));}
function motor_brand_owner(): bool {
    global $config;
    if (!is_user() || ($_SESSION['log']??'')!==($config['nickname']??'')) return false;
    $profile=reading_profil($_SESSION['log']);
    return (int)($profile[7]??0)===101 && empty($profile[37]);
}
function motor_brand_text(mixed $value,int $max,bool $required): string {
    if (!is_string($value) || strlen($value)>$max*4 || !mb_check_encoding($value,'UTF-8') || preg_match('/\p{C}/u',$value)) throw new InvalidArgumentException('Введите обычный текст в одну строку.');
    $value=trim($value);
    if (($required && $value==='') || mb_strlen($value)>$max) throw new InvalidArgumentException('Название: от 1 до 100 символов; подпись: до 100 символов.');
    return $value;
}
function motor_brand_logo(mixed $value): string {
    if (!is_string($value) || strlen($value)>2048 || preg_match('~[\x00-\x20<>"\x27`\\\\]~',$value)) throw new InvalidArgumentException('Укажите путь к картинке или полный HTTPS-адрес без пробелов.');
    if ($value==='') return 'assets/lesika/lesozavodsk.svg';
    // Keep the bundled emblem independent of an old installation hostname.
    if (preg_match('~^https?://[^/]+/(?:.*/)?assets/lesika/lesozavodsk\.svg$~D',$value)) return 'assets/lesika/lesozavodsk.svg';
    if (str_starts_with($value,'https://')) {
        $url=parse_url($value);
        if (!filter_var($value,FILTER_VALIDATE_URL) || !$url || isset($url['user']) || isset($url['pass']) || isset($url['fragment'])) throw new InvalidArgumentException('Неверный HTTPS-адрес логотипа.');
        return $value; // Render in img only; never fetch remote URLs on the server.
    }
    if (!preg_match('~^(?:assets|images)/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|gif|webp|svg)$~Di',$value)) throw new InvalidArgumentException('Локальная картинка должна находиться в images/ или assets/. Форматы: PNG, JPG, GIF, WebP, SVG.');
    $path=rtrim(BASEDIR,'/')?:'.';foreach(explode('/',$value) as $segment){$path.='/'.$segment;if(is_link($path))throw new InvalidArgumentException('Ссылки на файлы логотипа не поддерживаются.');}
    if (!is_file($path) || !is_readable($path)) throw new InvalidArgumentException('Картинка не найдена. Проверьте путь от корня сайта.');
    return $value;
}
function motor_brand_values(array $config): array {
    $title=motor_brand_decode((string)($config['title']??'Лесозаводск онлайн'));
    $subtitle=motor_brand_decode((string)($config['logos']??''));
    try {$logo=motor_brand_logo(motor_brand_decode((string)($config['logotip']??'')));}catch(InvalidArgumentException $e){$logo='assets/lesika/lesozavodsk.svg';}
    return ['title'=>$title,'subtitle'=>$subtitle,'logo'=>$logo,'src'=>str_starts_with($logo,'https://')?$logo:BASEDIR.$logo];
}
function motor_brand_version(array $fields): string {return hash('sha256',json_encode(array_map(fn($i)=>(string)($fields[$i]??''),[11,12,15]),JSON_THROW_ON_ERROR));}
function motor_brand_save(array $input): void {
    motor_form_guard([]);
    if (!motor_brand_owner()) throw new RuntimeException('Настройки доступны только владельцу сайта.',403);
    $version=$input['version']??null;
    if (!is_string($version) || !preg_match('/^[a-f0-9]{64}$/D',$version)) throw new InvalidArgumentException('Обновите форму настроек.');
    $title=motor_brand_text($input['title']??null,100,true);$subtitle=motor_brand_text($input['subtitle']??null,100,false);$logo=motor_brand_logo($input['logo']??null);
    change_setting([11=>motor_brand_escape($title),12=>motor_brand_escape($subtitle),15=>motor_brand_escape($logo)],$version);
}
