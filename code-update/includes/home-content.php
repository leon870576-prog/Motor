<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
require_once __DIR__.'/home-settings.php';
require_once __DIR__.'/home-media.php';

function motor_home_escape($s): string {return htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function motor_home_plain(string $s,int $limit=240): string {
    $s=strip_tags(html_entity_decode(str_replace(['<br />','<br>','<br/>']," ",$s),ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'));
    $s=preg_replace('~\[/?(?:b|i|u|s|big|small|color|url|img|quote|code|size|center|left|right|spoiler)(?:=[^\]]*)?\]~iu','',$s);
    $s=trim(preg_replace('/\s+/u',' ',$s)??'');
    return mb_strlen($s)>$limit?mb_substr($s,0,$limit).'…':$s;
}
// Only fixed relative paths derived from validated catalogue identifiers reach this reader.
function motor_home_path(string $relative): ?string {
    $parts=explode('/',$relative);$path=rtrim(DATADIR,'/');
    foreach ($parts as $part) {if ($part==='' || $part==='.' || $part==='..') return null;$path.='/'.$part;if (is_link($path)) return null;}
    return is_file($path)?$path:null;
}
function motor_home_lines(string $relative): array {
    $path=motor_home_path($relative);if ($path===null) return [];
    $fp=@fopen($path,'rb');if (!$fp) return [];
    try {
        if (!flock($fp,LOCK_SH)) return [];
        $raw=stream_get_contents($fp,16777217);
        if ($raw===false || strlen($raw)>16777216 || !mb_check_encoding($raw,'UTF-8')) return [];
        return array_values(array_filter(preg_split('/\r\n|\n|\r/',$raw),fn($v)=>trim($v)!==''));
    } finally {flock($fp,LOCK_UN);fclose($fp);}
}
function motor_home_number(string $s): bool {return preg_match('/^[1-9][0-9]{0,17}$/D',$s)===1;}
function motor_home_time(string $s): bool {return preg_match('/^[1-9][0-9]{0,9}$/D',$s)===1 && (int)$s<=SITETIME;}
function motor_home_catalog(string $kind): array {
    if (!isset(motor_home_sections()[$kind])) throw new InvalidArgumentException('Неизвестный блок.');
    $items=[];
    $add=function(string $id,string $title,string $text,string $author,int $time,string $url,string $image='',string $comments='',string $detail='',array $media=[]) use (&$items) {
        if (isset($items[$id])) return;
        $items[$id]=['id'=>$id,'title'=>motor_home_plain($title,140),'text'=>motor_home_plain($text),'author'=>$author,'time'=>$time,'url'=>$url,'image'=>$image,'comments'=>$comments,'detail'=>motor_home_plain($detail,120),'sequence'=>count($items),'media'=>$media];
    };
    if ($kind==='news') foreach (motor_home_lines('news.dat') as $row) {
        $d=explode('|',$row);if (count($d)<6 || !motor_home_number($d[5]) || !motor_home_time($d[3])) continue;
        $url='news/komm.php?id='.$d[5];$add($d[5].':'.$d[3],$d[0],$d[1],$d[4],(int)$d[3],$url,'',$url.'#form','',['parent'=>$d[5]]);
    }
    if ($kind==='gallery') {
        require_once __DIR__.'/gallery.php';
        foreach (motor_home_lines('datagallery/fotobase.dat') as $row) {
            $d=explode('|',$row);if (count($d)<7 || !motor_gallery_valid_id($d[6]) || $d[3]==='hidden' || !motor_home_time($d[4]) || motor_home_path('datagallery/'.$d[6])===null) continue;
            $id=rawurlencode($d[6]);$add($d[6].':'.$d[4],$d[1],$d[0],$d[2],(int)$d[4],'gallery/index.php?action=showimg&gid='.$id,'gallery/resize.php?name='.$id,'gallery/index.php?action=komm&gid='.$id);
        }
    }
    if ($kind==='forum') foreach (motor_home_lines('dataforum/mainforum.dat') as $row) {
        $f=explode('|',$row);if (count($f)<2 || !motor_home_number($f[0])) continue;
        foreach (motor_home_lines('dataforum/topic'.$f[0].'.dat') as $topic) {
            $d=explode('|',$topic);if (count($d)<7 || !motor_home_number($d[0]) || $d[1]!==$f[0] || !motor_home_time($d[4]) || motor_home_path('dataforum/'.$f[0].'-'.$d[0].'.dat')===null) continue;
            $add($f[0].'-'.$d[0].':'.$d[4],$d[3],'',$d[2],(int)$d[4],'forum/topic.php?fid='.$f[0].'&id='.$d[0],'','',$f[1],['context'=>['fid'=>$f[0],'topic'=>$d[0]]]);
        }
    }
    if ($kind==='board') foreach (motor_home_lines('databoard/database.dat') as $row) {
        $c=explode('|',$row);if (count($c)<3 || !motor_home_number($c[2])) continue;
        foreach (motor_home_lines('databoard/'.$c[2].'.dat') as $record) {
            $d=explode('|',$record);if (count($d)<7 || !motor_home_number($d[5]) || $d[6]!==$c[2] || !motor_home_time($d[3]) || !ctype_digit($d[4]) || (int)$d[4]<SITETIME) continue;
            $add($c[2].'-'.$d[5].':'.$d[3],$d[0],$d[2],$d[1],(int)$d[3],'board/index.php?action=view&id='.$c[2].'&bid='.$d[5],'','',$c[0],['parent'=>$d[7]??'','context'=>['category'=>$c[2],'bid'=>$d[5]]]);
        }
    }
    if ($kind==='chat' || $kind==='book') foreach (motor_home_lines($kind.'.dat') as $row) {
        $d=explode('|',$row);if (count($d)<6 || !motor_home_time($d[3])) continue;
        // Legacy messages have no persistent ID. A content fingerprint never drifts to a different row after deletion.
        $id=$kind==='chat' && isset($d[9]) && preg_match('/^[a-f0-9]{32}$/D',$d[9])?'c:'.$d[9]:'h:'.hash('sha256',$row);
        $add($id,'',$d[0],$d[1],(int)$d[3],$kind.'/index.php');
    }
    $items=array_values($items);
    usort($items,fn($a,$b)=>($b['time']<=>$a['time'])?:($b['sequence']<=>$a['sequence']));
    return $items;
}
function motor_home_pick(array $items,array $block): array {
    if ($block['mode']==='selected') {
        $map=array_column($items,null,'id');$out=[];
        foreach ($block['selected'] as $id) if (isset($map[$id])) $out[]=$map[$id];
    } else $out=$block['mode']==='oldest'?array_reverse($items):$items;
    return array_slice($out,0,$block['count']);
}
function motor_home_author(string $author): string {
    if (preg_match('/^[a-z0-9_-]{1,20}$/Di',$author)) return '<a href="'.BASEDIR.'pages/userpage.php?uz='.rawurlencode($author).'">'.motor_home_escape(motor_home_plain(nickname($author),60)).'</a>';
    return motor_home_escape(motor_home_plain($author,60));
}
function motor_home_item(array $item,string $kind,?array $options=null): void {
    $h='motor_home_escape';$url=$h(BASEDIR.$item['url']);
    echo '<article class="home-item" data-home-record="'.$h($item['id']).'">';
    if ($item['image']!=='' && ($options===null || $options['photos'])) echo '<a class="home-photo" href="'.$url.'"><img src="'.$h(BASEDIR.$item['image']).'" alt="'.$h($item['title']?:'Фото из галереи').'" width="480" height="320" loading="lazy" decoding="async"></a>';
    if ($kind==='gallery' && $options!==null) {echo '</article>';return;}
    motor_home_render_media($item,$kind,$options??['photos'=>true,'videos'=>true]);
    if ($item['title']!=='') echo '<h3><a href="'.$url.'">'.$h($item['title']).'</a></h3>';
    echo '<p class="home-meta">'.motor_home_author($item['author']).' · '.$h(date_fixed($item['time'])).'</p>';
    if ($item['detail']!=='') echo '<p class="home-meta">'.$h($item['detail']).'</p>';
    if ($item['text']!=='') echo '<p class="home-excerpt">'.$h($item['text']).'</p>';
    if ($item['comments']!=='') {
        $record=explode(':',$item['id'])[0];$count=count(motor_home_lines($kind==='news'?'datakomm/'.$record.'.dat':'datagallery/'.$record.'.dat'));
        echo '<a class="home-open" href="'.$h(BASEDIR.$item['comments']).'">Комментарии ('.$count.')</a>';
    }
    elseif ($kind==='chat' || $kind==='book') echo '<a class="home-open" href="'.$url.'#form">Читать и ответить</a>';
    echo '</article>';
}
function motor_home_render(): void {
    try {$settings=motor_home_settings();}
    catch(Throwable $e) {echo '<p class="notice-error">Лента главной страницы временно недоступна.</p>';return;}
    echo '<div class="home-feed">';
    foreach ($settings['order'] as $kind) {
        $block=$settings['blocks'][$kind];if ($block['count']===0) continue;
        [$title,$href]=motor_home_sections()[$kind];$items=motor_home_pick(motor_home_catalog($kind),$block);
        if ($kind==='gallery') {
            if (!$block['photos'] || !$items) continue;
            echo '<section class="home-block" data-home-block="gallery" aria-labelledby="home-gallery" style="--home-gallery-width:'.$settings['gallery_size']['width'].'px;--home-gallery-height:'.$settings['gallery_size']['height'].'px"><header class="home-block-heading"><h2 id="home-gallery">'.$title.'</h2></header>';
        } else echo '<section class="home-block" data-home-block="'.$kind.'" aria-labelledby="home-'.$kind.'"><header class="home-block-heading"><h2 id="home-'.$kind.'">'.$title.'</h2><a href="'.BASEDIR.$href.'">Все записи →</a></header>';
        if (!$items) echo '<p class="home-empty">'.($block['mode']==='selected'?'Пока нет выбранных записей.':'Пока нет записей.').'</p>';
        else {echo '<div class="home-items">';foreach ($items as $item) motor_home_item($item,$kind,$block);echo '</div>';}
        echo '</section>';
    }
    echo '</div>';
}
