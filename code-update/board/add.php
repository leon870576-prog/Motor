<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/board.php';
include '../themes/'.$config['themes'].'/index.php';
show_title('partners.gif','Добавление объявления');
try {
    motor_media_request_guard();$id=motor_board_number($_GET['id']??'');
    if(!is_user())throw new RuntimeException('Войдите на сайт, чтобы добавить объявление.',403);
    if(!motor_board_category($id))throw new RuntimeException('Рубрика не существует.',404);
    $action=$_GET['action']??'';
    if($action==='add') {
        [$title,$message]=motor_board_input();$days=filter_var($_POST['days']??null,FILTER_VALIDATE_INT);
        if($days===false || $days<1 || $days>(int)$config['boarddays'])throw new RuntimeException('Недопустимый срок показа объявления.',400);
        antiflood('Location: add.php?id='.$id.'&isset=antiflood');karantin($udata[6],'Location: add.php?id='.$id.'&isset=karantin');
        motor_media_lock();if(!motor_board_category($id))throw new RuntimeException('Рубрика уже удалена.',404);
        $bid=unifile(motor_board_path($id),5);$parent=motor_media_uuid();
        $row=implode('|',[$title,$log,$message,SITETIME,SITETIME+$days*86400,$bid,$id,$parent,'']);
        motor_media_save_record('board',$parent,['category'=>$id,'bid'=>$bid],motor_board_path($id),null,$row);
        header('Location: index.php?action=view&id='.$id.'&bid='.$bid.'&isset=addboard');exit;
    }
    if($action!=='')throw new RuntimeException('Действие не найдено.',404);
    echo '<form method="post" enctype="multipart/form-data" action="add.php?action=add&amp;id='.$id.'">';motor_form_token();
    echo '<label>Заголовок<input name="zag" required minlength="5" maxlength="50"></label><label>Объявление<textarea name="msg" required minlength="10" maxlength="1000" rows="5" data-smile-picker data-smile-scope="common"></textarea></label>';
    echo '<label>Срок показа, дней<input type="number" name="days" required min="1" max="'.(int)$config['boarddays'].'" value="'.min(5,(int)$config['boarddays']).'"></label>';
    motor_media_form('board');echo '<button type="submit" class="primary">Добавить объявление</button></form>';
    echo '<p><a href="index.php?action=board&amp;id='.$id.'">Вернуться к объявлениям</a></p>';
} catch(Throwable $e){motor_board_error($e);}
include '../themes/'.$config['themes'].'/foot.php';
