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
    foreach (motor_portal_brand_fields($fields) as $index=>$value) $config[$keys[$index]]=$value;
    return $config;
}
