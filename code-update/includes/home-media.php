<?php
if (!defined('BASEDIR') || !defined('DATADIR')) {http_response_code(403);exit;}

// Inspect only selected records. Never fetch remote URLs or expose private storage paths.
function motor_home_media(array $item,string $kind,array $options): array {
    if (!$options['photos'] && !$options['videos']) return [];
    $ref=$item['media']??[];
    if (!$ref || !in_array($kind,['news','forum','board'],true)) return [];
    require_once __DIR__.'/attachments.php';
    $parent=$ref['parent']??'';$context=$ref['context']??[];
    if ($kind==='forum') {
        $rows=motor_home_lines('dataforum/'.$context['fid'].'-'.$context['topic'].'.dat');
        if (!$rows) return [];
        $first=explode('|',$rows[0]);$parent=trim($first[6]??'');
    }
    if (!motor_media_valid_parent($kind,$parent)) return [];
    $relative='attachments/'.$kind.'/'.$parent.'/';$path=motor_home_path($relative.'manifest.json');
    if ($path===null) return [];
    $raw=@file_get_contents($path,false,null,0,1048577);
    if ($raw===false || strlen($raw)>1048576) return [];
    try {$manifest=json_decode($raw,true,12,JSON_THROW_ON_ERROR);}catch(Throwable $e){return [];}
    if (!is_array($manifest) || !isset($manifest['files']) || !is_array($manifest['files']) || !array_is_list($manifest['files']) || count($manifest['files'])>100) return [];
    // Reject stale/misassigned manifests rather than requesting a different record's media.
    if ($context && !is_array($manifest['context']??null)) return [];
    foreach ($context as $key=>$value) {
        $stored=$manifest['context'][$key]??null;
        if ((!is_string($stored) && !is_int($stored)) || (string)$stored!==(string)$value) return [];
    }
    $types=motor_media_types();$out=[];
    foreach ($manifest['files'] as $file) {
        if (!is_array($file) || !is_string($file['id']??null) || !preg_match('/^[a-f0-9]{32}$/D',$file['id']) || !is_string($file['ext']??null) || !isset($types[$file['ext']])) continue;
        [$type,$mime]=$types[$file['ext']];
        if (!in_array($type,['photo','video'],true) || ($file['kind']??null)!==$type || ($file['mime']??null)!==$mime || isset($out[$type]) || !$options[$type==='photo'?'photos':'videos']) continue;
        if ($kind==='board' && $type!=='photo') continue;
        if (!is_string($file['name']??null) || strlen($file['name'])>1024 || !is_int($file['size']??null) || $file['size']<1) continue;
        $blob=motor_home_path($relative.$file['id'].'.blob');
        if ($blob===null || @filesize($blob)<1) continue;
        if ($type==='photo' && !@getimagesize($blob)) continue;
        $url='attachment.php?'.http_build_query(['section'=>$kind,'parent'=>$parent,'file'=>$file['id']], '', '&', PHP_QUERY_RFC3986);
        if ($kind==='board') $url.='&preview=1';
        $out[$type]=['kind'=>$type,'url'=>$url,'name'=>motor_home_plain($file['name'],180)];
    }
    return array_values($out);
}

function motor_home_render_media(array $item,string $kind,array $options): void {
    $media=motor_home_media($item,$kind,$options);if (!$media) return;
    $h='motor_home_escape';echo '<div class="home-media">';
    foreach ($media as $file) {
        $src=$h(BASEDIR.$file['url']);$label=$h($file['name']?:($item['title']?:'Вложение'));
        if ($file['kind']==='photo') echo '<a class="home-photo" href="'.$h(BASEDIR.$item['url']).'"><img src="'.$src.'" alt="'.$label.'" width="480" height="320" loading="lazy" decoding="async"></a>';
        else echo '<video class="home-video" controls playsinline preload="none" width="480" height="270" src="'.$src.'" aria-label="Видео: '.$label.'">Видео: <a href="'.$src.'">'.$label.'</a></video>';
    }
    echo '</div>';
}
