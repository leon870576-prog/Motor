<?php
// Personal pages are separate from legacy profiles and the shared gallery.
if (!defined('DATADIR')) { http_response_code(403); exit; }
require_once __DIR__.'/gallery.php';
require_once __DIR__.'/userpage-news-comments.php';
require_once __DIR__.'/userpage-activity.php';

function motor_userpage_login($value): bool {
    return is_string($value) && (bool)preg_match('/^[a-z0-9-]{3,20}$/Di', $value);
}
function motor_userpage_profile($owner): array {
    if (!motor_userpage_login($owner)) throw new RuntimeException('Пользователь не найден.',404);
    $dir=DATADIR.'profil';$path=$dir.'/'.$owner.'.prof';
    if (is_link($dir) || is_link($path) || !is_file($path)) throw new RuntimeException('Пользователь не найден.',404);
    $raw=motor_info_read($path);$p=explode(':||:', $raw === false ? '' : $raw);
    // Field 25 is the legacy login flag, not an account-activation flag: pages stay visible offline.
    if (($p[0]??'')!==$owner) throw new RuntimeException('Пользователь не найден.',404);
    return $p;
}
function motor_userpage_root(bool $create=false): string {
    $root=DATADIR.'userpages';
    if (is_link($root) || (file_exists($root) && !is_dir($root))) throw new RuntimeException('Хранилище страниц недоступно.',503);
    if ($create && !is_dir($root) && !@mkdir($root,0700) && !is_dir($root)) throw new RuntimeException('Не удалось создать хранилище страниц.',503);
    return $root;
}
function motor_userpage_default(string $owner): array {
    return ['schema'=>1,'owner'=>$owner,'revision'=>0,'created'=>0,'updated'=>0,'published'=>false,'title'=>'','about'=>'','guestbook_open'=>true,'news'=>[],'guestbook'=>[],'recent'=>[],'audit'=>[]];
}
function motor_userpage_text_input($value,int $min,int $max,bool $single=false): string {
    if (!is_string($value) || strlen($value)>$max*4 || !mb_check_encoding($value,'UTF-8')) throw new RuntimeException('Некорректное текстовое поле.',400);
    $value=trim(str_replace(["\r\n","\r"],"\n",$value));
    if (mb_strlen($value,'UTF-8')<$min || mb_strlen($value,'UTF-8')>$max || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x{202a}-\x{202e}\x{2066}-\x{2069}]/u',$value) || ($single && str_contains($value,"\n"))) {
        throw new RuntimeException('Текст должен содержать от '.$min.' до '.$max.' символов'.($single?' в одну строку.':'.'),400);
    }
    return $value;
}
function motor_userpage_validate(array $d,string $owner): void {
    if (($d['schema']??null)!==1 || ($d['owner']??null)!==$owner || !is_int($d['revision']??null) || $d['revision']<0 || !is_bool($d['published']??null) || !is_bool($d['guestbook_open']??null)) throw new RuntimeException('Данные страницы повреждены. Обратитесь к администратору.',503);
    foreach (['created','updated'] as $k) if (!is_int($d[$k]??null) || $d[$k]<0) throw new RuntimeException('Данные страницы повреждены.',503);
    motor_userpage_text_input($d['title']??null,0,100,true);motor_userpage_text_input($d['about']??null,0,2000);
    foreach (['news'=>100,'guestbook'=>500,'recent'=>128,'audit'=>100] as $k=>$max) if (!is_array($d[$k]??null) || !array_is_list($d[$k]) || count($d[$k])>$max) throw new RuntimeException('Данные страницы повреждены.',503);
    foreach (['news','guestbook'] as $kind) {
        $seen=[];
        foreach ($d[$kind] as $e) {
            if (!is_array($e) || !preg_match('/^[a-f0-9]{32}$/D',$e['id']??'') || isset($seen[$e['id']]) || !motor_userpage_login($e['author']??null) || ($kind==='news' && $e['author']!==$owner)) throw new RuntimeException('Запись страницы повреждена.',503);
            $seen[$e['id']]=true;
            foreach (['created','updated','revision'] as $k) if (!is_int($e[$k]??null) || $e[$k]<1) throw new RuntimeException('Запись страницы повреждена.',503);
            motor_userpage_text_input($e['text']??null,1,$kind==='news'?8000:2000);
            if ($kind==='news') motor_userpage_text_input($e['title']??null,1,100,true);
        }
    }
    motor_userpage_validate_comments($d);
    foreach ($d['recent'] as $e) if (!is_array($e) || !is_string($e['id']??null) || !preg_match('/^[a-f0-9]{32}$/D',$e['id']) || !motor_userpage_login($e['actor']??null) || !in_array($e['kind']??null,['news_add','guest_add','comment_add'],true) || !is_string($e['hash']??null) || !preg_match('/^[a-f0-9]{64}$/D',$e['hash']) || !is_int($e['time']??null)) throw new RuntimeException('Данные страницы повреждены.',503);
}
function motor_userpage_read(string $owner): array {
    if (!motor_userpage_login($owner)) throw new RuntimeException('Пользователь не найден.',404);
    $path=motor_userpage_root().'/'.$owner.'.json';
    if (is_link($path) || (file_exists($path) && !is_file($path))) throw new RuntimeException('Хранилище страницы недоступно.',503);
    if (!file_exists($path)) return motor_userpage_default($owner);
    $raw=file_get_contents($path,false,null,0,8*1048576+1);
    if ($raw===false || strlen($raw)>8*1048576) throw new RuntimeException('Не удалось прочитать страницу.',503);
    try {$data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}
    catch (Throwable $e) {throw new RuntimeException('Данные страницы повреждены. Они не будут перезаписаны.',503);}
    if (!is_array($data)) throw new RuntimeException('Данные страницы повреждены.',503);
    motor_userpage_validate($data,$owner);
    return $data;
}
function motor_userpage_mutate(string $owner,callable $update,?callable $afterSave=null): array {
    motor_userpage_profile($owner);
    $root=motor_userpage_root(true);$lockPath=$root.'/'.$owner.'.lock';
    if (is_link($lockPath) || (file_exists($lockPath) && !is_file($lockPath))) throw new RuntimeException('Хранилище страницы недоступно.',503);
    $lock=@fopen($lockPath,'c');
    if (!$lock) throw new RuntimeException('Не удалось открыть страницу для изменения.',503);
    try {
        if (!flock($lock,LOCK_EX)) throw new RuntimeException('Страница временно занята.',503);
        $data=motor_userpage_read($owner);$next=$update($data);
        if ($next!==$data) {
            motor_userpage_validate($next,$owner);
            $json=json_encode($next,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
            if (strlen($json)>8*1048576) throw new RuntimeException('Хранилище страницы заполнено.',409);
            motor_media_atomic($root.'/'.$owner.'.json',$json."\n");
        }
        if ($afterSave) $afterSave($next);
        return $next;
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}
function motor_userpage_version($value,int $expected): void {
    if (!is_string($value) || !preg_match('/^[0-9]{1,16}$/D',$value) || $value!==(string)$expected) throw new RuntimeException('Запись уже изменилась. Откройте форму заново.',409);
}
function motor_userpage_id($value): string {
    if (!is_string($value) || !preg_match('/^[a-f0-9]{32}$/D',$value)) throw new RuntimeException('Некорректный идентификатор записи.',400);
    return $value;
}
function motor_userpage_apply(string $owner,string $actor,bool $staff,string $action,array $input,int $now): array {
    global $config;
    $profile=motor_userpage_profile($actor);
    if (!empty($profile[37]) || (!empty($config['regkeys']) && !empty($profile[46]))) throw new RuntimeException('Учётная запись не может публиковать записи.',403);
    if (str_starts_with($action,'comment_')) return motor_userpage_comment_apply($owner,$actor,$staff,$action,$input,$now,$profile);
    $self=$actor===$owner;
    if (str_starts_with($action,'guest_')) motor_userpage_activity_receipts($profile[97]??null);
    if (!in_array($action,['save','news_add','news_edit','news_delete','guest_add','guest_edit','guest_delete'],true)) throw new RuntimeException('Неизвестное действие.',400);
    if (($action==='save' || str_starts_with($action,'news_') && $action!=='news_delete') && !$self) throw new RuntimeException('Изменять страницу и новости может только её владелец.',403);
    if (in_array($action,['news_add','guest_add','comment_add'],true) && (int)($profile[6]??0)+(int)($config['karantin']??0)>$now) throw new RuntimeException('Публикация станет доступна после карантина нового аккаунта.',403);
    return motor_userpage_mutate($owner,function(array $data) use($owner,$actor,$staff,$self,$action,$input,$now,$config): array {
        if (!$data['published'] && !$self && !$staff) throw new RuntimeException('Страница пока не опубликована.',404);
        $data=motor_userpage_activity_upgrade($data);
        if (str_starts_with($action,'guest_')) motor_userpage_activity_sync($actor,$owner,$data['comment_totals'][$actor]??0,$data['review_totals'][$actor]??0);
        $id='';
        if ($action==='save') {
            motor_userpage_version($input['revision']??null,$data['revision']);
            $data['title']=motor_userpage_text_input($input['title']??null,1,100,true);
            $data['about']=motor_userpage_text_input($input['about']??null,0,2000);
            foreach (['published','guestbook_open'] as $k) {
                if (!in_array($input[$k]??null,['0','1'],true)) throw new RuntimeException('Некорректная настройка страницы.',400);
                $data[$k]=$input[$k]==='1';
            }
        } else {
            if (!$data['created']) throw new RuntimeException('Сначала создайте личную страницу.',409);
            $kind=str_starts_with($action,'news_')?'news':'guestbook';
            $id=motor_userpage_id($input['id']??null);
            $index=null;foreach ($data[$kind] as $i=>$e) if ($e['id']===$id) {$index=$i;break;}
            if (str_ends_with($action,'_add')) {
                if ($kind==='guestbook' && !$data['guestbook_open']) throw new RuntimeException('Владелец закрыл новые отзывы.',403);
                $text=motor_userpage_text_input($input['msg']??null,1,$kind==='news'?8000:2000);
                $title=$kind==='news'?motor_userpage_text_input($input['title']??null,1,100,true):'';
                $hash=hash('sha256',$title."\0".$text);
                foreach ($data['recent'] as $r) if ($r['id']===$id) {
                    if ($r['actor']===$actor && $r['kind']===$action && hash_equals($r['hash'],$hash)) return $data;
                    throw new RuntimeException('Форма уже использована. Откройте новую форму.',409);
                }
                if ($index!==null) throw new RuntimeException('Такая запись уже существует.',409);
                $interval=max(5,min(300,(int)($config['floodstime']??15)));
                foreach ($data['recent'] as $r) if ($r['actor']===$actor && $r['time']+$interval>$now) throw new RuntimeException('Подождите '.$interval.' секунд перед следующей публикацией на этой странице.',429);
                if (count($data[$kind])>=($kind==='news'?100:500)) throw new RuntimeException('Достигнут лимит: '.($kind==='news'?'100 новостей':'500 отзывов').'. Удалите ненужные записи.',409);
                $entry=['id'=>$id,'author'=>$actor,'text'=>$text,'created'=>$now,'updated'=>$now,'revision'=>1];
                if ($kind==='news') $entry['title']=$title;
                $data[$kind][]=$entry;
                if ($kind==='guestbook') $data['review_totals'][$actor]=($data['review_totals'][$actor]??0)+1;
                $data['recent'][]=['id'=>$id,'actor'=>$actor,'kind'=>$action,'hash'=>$hash,'time'=>$now];
                $data['recent']=array_slice($data['recent'],-128);
            } else {
                if ($index===null) throw new RuntimeException('Запись не найдена.',404);
                $entry=$data[$kind][$index];
                $deleting=str_ends_with($action,'_delete');
                if ($deleting ? !($self || $staff || $kind==='guestbook' && $entry['author']===$actor) : !($kind==='news'?$self:$entry['author']===$actor)) throw new RuntimeException('Недостаточно прав для изменения этой записи.',403);
                motor_userpage_version($input['revision']??null,$entry['revision']);
                if ($deleting) {array_splice($data[$kind],$index,1);}
                else {
                    $entry['text']=motor_userpage_text_input($input['msg']??null,1,$kind==='news'?8000:2000);
                    if ($kind==='news') $entry['title']=motor_userpage_text_input($input['title']??null,1,100,true);
                    $entry['updated']=$now;$entry['revision']++;$data[$kind][$index]=$entry;
                }
            }
        }
        $data['created']=$data['created']?:$now;$data['updated']=$now;$data['revision']++;
        $data['audit'][]=['time'=>$now,'actor'=>$actor,'action'=>$action,'id'=>$id];$data['audit']=array_slice($data['audit'],-100);
        return $data;
    },function(array $data) use($owner,$actor,$action): void {
        if (str_starts_with($action,'guest_')) motor_userpage_activity_sync($actor,$owner,$data['comment_totals'][$actor]??0,$data['review_totals'][$actor]??0);
    });
}
function motor_userpage_url(string $owner,array $query=[]): string {
    return BASEDIR.'pages/userpage.php?'.http_build_query(['uz'=>$owner]+$query,'','&',PHP_QUERY_RFC3986);
}
function motor_userpage_label(string $name): string {
    // Do not pass stored comment authors to nickname() before validating the path component.
    if (!motor_userpage_login($name)) return 'Участник';
    try {$p=motor_userpage_profile($name);} catch (Throwable $e) {return motor_gallery_escape($name);}
    global $config;
    $label=!empty($config['includenick']) && (int)($p[36]??0)>=motor_points_min('nickname') && !empty($p[65])?motor_gallery_plain($p[65]):$name;
    return motor_gallery_escape($label);
}
function motor_userpage_author(string $name): string {
    if (!motor_userpage_login($name)) return 'Участник';
    return '<a href="'.motor_gallery_escape(motor_userpage_url($name)).'">'.motor_userpage_label($name).'</a>';
}
function motor_userpage_render_text(string $text): string {
    return bb_code(nl2br(motor_gallery_escape($text)));
}
function motor_userpage_photos(string $owner): array {
    $photos=[];
    foreach (array_reverse(motor_gallery_rows()) as $i=>$row) {
        $d=explode('|',$row);$p=['index'=>$i,'row'=>$row,'data'=>$d];
        if (($d[2]??'')!==$owner || !motor_gallery_valid_id($d[6]??null) || !motor_gallery_visible($p)) continue;
        $path=DATADIR.'datagallery/'.$d[6];
        if (is_file($path) && !is_link($path)) $photos[]=$p;
    }
    return $photos;
}
function motor_userpage_comments(string $id): array {
    $result=['count'=>0,'recent'=>[]];
    if (!motor_gallery_valid_id($id)) return $result;
    $path=DATADIR.'datagallery/'.$id.'.dat';
    if (!is_file($path) || is_link($path)) return $result;
    $stream=@fopen($path,'rb');
    if (!$stream) throw new RuntimeException('Не удалось прочитать комментарии к фотографии.',503);
    $bytes=0;
    try {
        // The full gallery permits thousands of comments. Keep only the two displayed rows in memory.
        while (($row=fgets($stream,65537))!==false) {
            $bytes+=strlen($row);
            if ($bytes>128*1048576 || strlen($row)>=65536 && !str_ends_with($row,"\n")) throw new RuntimeException('Не удалось прочитать комментарии к фотографии.',503);
            $row=rtrim($row,"\r\n");if (trim($row)==='') continue;
            $result['count']++;$result['recent'][]=$row;
            if (count($result['recent'])>2) array_shift($result['recent']);
        }
        if (!feof($stream)) throw new RuntimeException('Не удалось прочитать комментарии к фотографии.',503);
    } finally {fclose($stream);}
    $result['recent']=array_reverse($result['recent']);
    return $result;
}
