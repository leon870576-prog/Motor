<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}
require_once __DIR__.'/attachments.php';
function motor_board_staff(): bool {return is_admin([101,102,103,105]);}
function motor_board_number($value): int {
    if ((!is_string($value) && !is_int($value)) || !preg_match('/^[1-9][0-9]{0,17}$/D',(string)$value)) throw new RuntimeException('Неверный номер объявления или рубрики.',400);
    return (int)$value;
}
function motor_board_label(string $text): string {return motor_media_escape(html_entity_decode($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'));}
function motor_board_rows(string $path): array {return is_file($path)?array_filter(file($path,FILE_IGNORE_NEW_LINES),fn($row)=>trim($row)!==''):[];}
function motor_board_path(int $category): string {return DATADIR.'databoard/'.motor_board_number($category).'.dat';}
function motor_board_categories(): array {return motor_board_rows(DATADIR.'databoard/database.dat');}
function motor_board_category(int $id): ?array {
    foreach(motor_board_categories() as $index=>$row){$d=explode('|',$row);if(($d[2]??'')===(string)$id)return ['index'=>$index,'row'=>$row,'data'=>$d];}return null;
}
function motor_board_find(int $category,int $bid): ?array {
    if(!motor_board_category($category))return null;
    foreach(motor_board_rows(motor_board_path($category)) as $index=>$row){$d=array_pad(explode('|',$row),8,'');if($d[5]===(string)$bid && (int)$d[4]>=SITETIME)return ['index'=>$index,'row'=>$row,'data'=>$d];}return null;
}
function motor_board_parent(array $data): string {return isset($data[7]) && preg_match('/^[a-f0-9]{32}$/D',$data[7])?$data[7]:'';}
function motor_board_save_rows(string $path,array $rows): void {motor_media_atomic($path,$rows?implode("\r\n",array_values($rows))."\r\n":'');}
function motor_board_prune(int $category): array {
    motor_media_lock();$path=motor_board_path($category);$rows=motor_board_rows($path);$keep=[];$expired=[];
    foreach($rows as $i=>$row){$d=explode('|',$row);if((int)($d[4]??0)<SITETIME)$expired[]=$d;else $keep[$i]=$row;}
    if($expired){motor_board_save_rows($path,$keep);foreach($expired as $d)motor_media_delete('board',motor_board_parent($d));$keep=array_values($keep);}
    return $keep;
}
require_once __DIR__.'/board-settings.php';
function motor_board_input(): array {
    motor_form_guard(['zag','msg']);$title=check(trim($_POST['zag']));$message=check(trim($_POST['msg']));
    if(utf_strlen($title)<5||utf_strlen($title)>50||utf_strlen($message)<10||utf_strlen($message)>1000)throw new RuntimeException('Заголовок: от 5 до 50 символов; объявление: от 10 до 1000.',400);
    return [no_br($title),no_br($message,'<br />')];
}
function motor_board_author(string $name): string {
    return preg_match('/^[a-z0-9-]{3,20}$/Di',$name)?'<a href="'.BASEDIR.'pages/anketa.php?uz='.rawurlencode($name).'">'.motor_board_label(nickname($name)).'</a>':'Участник';
}
function motor_board_card(array $d,bool $detail=false): void {
    global $log;$id=motor_board_number($d[6]);$bid=motor_board_number($d[5]);
    $url=BASEDIR.'board/index.php?action=view&amp;id='.$id.'&amp;bid='.$bid;
    echo '<article class="board-card"><div class="b"><b><a href="'.$url.'">'.motor_board_label($d[0]).'</a></b> <small>'.date_fixed((int)$d[3]).'</small></div><div class="board-excerpt">'.bb_code($d[2]);
    $parent=motor_board_parent($d);if($parent)motor_media_render('board',$parent,$detail?0:1);
    echo '<p>Автор: '.motor_board_author($d[1]).'</p>';
    if($detail)echo '<p>Объявление действует до '.date_fixed((int)$d[4]).'.</p>';
    if(is_user() && ($log===$d[1] || motor_board_staff()))echo '<a class="touch-link" href="'.BASEDIR.'board/edit.php?id='.$id.'&amp;bid='.$bid.'">Редактировать текст и фото</a>';
    echo '</div></article>';
}
function motor_board_error(Throwable $e): never {motor_media_stop($e->getMessage(),$e->getCode()>=400&&$e->getCode()<=599?$e->getCode():400);}
function motor_board_selected(): array {
    $selected=$_POST['del']??[];if(!is_array($selected)||!$selected||count($selected)>100)throw new RuntimeException('Выберите от 1 до 100 записей.',400);
    return array_values(array_unique(array_map('motor_board_number',$selected)));
}

function motor_board_version(array $record): string {
    $parent=motor_board_parent($record['data']);
    return $record['row']."\n".json_encode($parent?motor_media_manifest('board',$parent):['files'=>[]],JSON_THROW_ON_ERROR);
}
