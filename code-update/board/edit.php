<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/board.php';
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Редактирование объявления');
try {
    motor_media_request_guard();$id=motor_board_number($_GET['id']??'');$bid=motor_board_number($_GET['bid']??'');
    if(!is_user())throw new RuntimeException('Войдите на сайт.',403);
    $record=motor_board_find($id,$bid);if(!$record)throw new RuntimeException('Объявление не найдено или срок показа истёк.',404);
    if($record['data'][1]!==$log && !motor_board_staff())throw new RuntimeException('Можно редактировать только своё объявление.',403);
    if($_SERVER['REQUEST_METHOD']==='POST'){
        [$title,$message]=motor_board_input();motor_media_check_version(motor_board_version($record));$d=$record['data'];$parent=motor_board_parent($d)?:motor_media_uuid();$d[0]=$title;$d[2]=$message;$d[7]=$parent;
        motor_media_save_record('board',$parent,['category'=>$id,'bid'=>$bid],motor_board_path($id),$record['index'],rtrim(implode('|',$d),'|').'|');
        header('Location: index.php?action=view&id='.$id.'&bid='.$bid);exit;
    }
    $d=$record['data'];echo '<form method="post" enctype="multipart/form-data">';motor_form_token();motor_media_version(motor_board_version($record));
    echo '<label>Заголовок<input name="zag" required minlength="5" maxlength="50" value="'.motor_board_label($d[0]).'"></label><label>Объявление<textarea name="msg" required minlength="10" maxlength="1000" rows="5" data-smile-picker data-smile-scope="common">'.motor_media_escape(html_entity_decode(str_replace('<br />',"\n",$d[2]),ENT_QUOTES,'UTF-8')).'</textarea></label>';
    motor_media_render('board',motor_board_parent($d));motor_media_form('board',motor_board_parent($d));echo '<button type="submit" class="primary">Сохранить объявление</button></form>';
    echo '<p><a href="index.php?action=view&amp;id='.$id.'&amp;bid='.$bid.'">К объявлению</a></p>';
} catch(Throwable $e){motor_board_error($e);}
include '../themes/'.$config['themes'].'/foot.php';
