<?php
#-----------------------------------------------------#
#          ********* WAP-MOTORS *********             #
#              Made by  :  VANTUZ                     #
#               E-mail  :  visavi.net@mail.ru         #
#                 Site  :  http://pizdec.ru           #
#             WAP-Site  :  http://visavi.net          #
#                  ICQ  :  36-44-66                   #
#  Вы не имеете право вносить изменения в код скрипта #
#        для его дальнейшего распространения          #
#-----------------------------------------------------#	
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/chat.php';
if (!is_admin([101,102,103,105])) {http_response_code(403);exit('Недостаточно прав.');}
$settings=motor_chat_settings();$action=is_string($_GET['action']??'')?($_GET['action']??''):'';$start=max(0,(int)($_GET['start']??0));$error='';
$mutations=['del','addedit','alldel','restatement'];
if (in_array($action,$mutations,true)) {
    motor_form_guard([]);
    if (in_array($action,['alldel','restatement'],true) && !is_admin([101])) {http_response_code(403);exit('Недостаточно прав.');}
    try {
        motor_chat_transaction(function (&$rows,&$state) use ($action,$settings) {
            $version=$_POST['version']??'';
            if (!is_string($version)) throw new RuntimeException('Неверная версия записи.',400);
            if ($action==='addedit') {
                $id=(int)($_GET['id']??-1);$msg=$_POST['msg']??null;
                if (!is_string($msg) || mb_strlen(trim($msg),'UTF-8')<1 || mb_strlen($msg,'UTF-8')>5000) throw new RuntimeException('Введите сообщение длиной 1–5000 символов.',400);
                if (!isset($rows[$id]) || !hash_equals(hash('sha256',$rows[$id]),$version)) throw new RuntimeException('Сообщение уже изменилось. Откройте его заново.',409);
                $data=explode('|',$rows[$id]);$data[0]=smiles(no_br(check($msg),'<br />'));$rows[$id]=implode('|',$data);
            } else {
                if (!hash_equals(hash('sha256',implode("\n",$rows)),$version)) throw new RuntimeException('В чате появились изменения. Обновите список и повторите действие.',409);
                if ($action==='del') {
                    $ids=$_POST['del']??null;
                    if (!is_array($ids) || !$ids || count($ids)>50) throw new RuntimeException('Выберите сообщения для удаления.',400);
                    foreach ($ids as $id) {if (!is_string($id) || !ctype_digit($id) || !isset($rows[(int)$id])) throw new RuntimeException('Неверный номер сообщения.',400);}
                    foreach ($ids as $id) unset($rows[(int)$id]);$rows=array_values($rows);
                }
                if ($action==='alldel') {$rows=[];$state=['quiz_after'=>SITETIME+$settings['quiz_wait']];}
                if ($action==='restatement') statistics(8,count($rows));
            }
        });
        header('Location: chat.php?start='.$start.'&isset=mp_yesset');exit;
    } catch (RuntimeException $e) {http_response_code(in_array($e->getCode(),[400,409],true)?$e->getCode():503);$error=$e->getMessage();$action='';}
}
$lock=motor_chat_lock();try {$rows=motor_chat_rows();}finally{flock($lock,LOCK_UN);fclose($lock);}
$total=count($rows);if($start>=$total)$start=0;
$version=hash('sha256',implode("\n",$rows));
include '../themes/'.$config['themes'].'/index.php';
show_title('chat.gif','Управление мини-чатом');
echo '<link rel="stylesheet" href="../assets/lesika/chat.css?v=chat1">';
if ($error!=='')echo '<p role="alert">'.motor_chat_escape($error).'</p>';
echo '<a class="touch-link" href="chat.php">Обновить список</a> / <a class="touch-link" href="../chat/index.php">Открыть чат</a>';
if(is_admin([101]))echo ' / <a class="touch-link" href="chat-settings.php">Настройки чата и ботов</a>';
if($action==='edit') {
    $id=(int)($_GET['id']??-1);
    if(isset($rows[$id])) {
        $data=explode('|',$rows[$id]);
        echo '<form method="post" action="chat.php?action=addedit&amp;id='.$id.'">';motor_form_token();
        echo '<input type="hidden" name="version" value="'.hash('sha256',$rows[$id]).'"><label for="chat-edit">Сообщение:</label><textarea id="chat-edit" name="msg" rows="5" data-smile-picker>'.motor_chat_escape(html_entity_decode(str_replace(['<br />','<br>'],"\n",nosmiles($data[0])),ENT_QUOTES,'UTF-8')).'</textarea><input type="submit" value="Сохранить"></form>';
    }else{http_response_code(404);show_error('Сообщение не найдено.');}
} elseif ($action==='prodel' && is_admin([101])) {
    echo '<p>Удалить все сообщения мини-чата?</p><form method="post" action="chat.php?action=alldel">';motor_form_token();
    echo '<input type="hidden" name="version" value="'.$version.'"><input type="submit" value="Удалить все сообщения"></form>';
} else {
    if($total) {
        echo '<form method="post" action="chat.php?action=del&amp;start='.$start.'">';motor_form_token();
        echo '<input type="hidden" name="version" value="'.$version.'">';
        foreach(array_slice(array_reverse(array_keys($rows)),$start,$settings['page_size']) as $id) {
            echo motor_chat_render_row($rows[$id],$id);
            echo '<label class="choice-hit"><input type="checkbox" name="del[]" value="'.$id.'"> Выбрать сообщение</label> <a class="touch-link" href="chat.php?action=edit&amp;id='.$id.'">Редактировать</a>';
        }
        echo '<p><input type="submit" value="Удалить выбранное"></p></form>';
        page_jumpnavigation('chat.php?',$settings['page_size'],$start,$total);page_strnavigation('chat.php?',$settings['page_size'],$start,$total);
    }else{echo '<p>Сообщений ещё нет.</p>';}
    echo '<p>Всего сообщений: <b>'.$total.'</b></p>';
    if(is_admin([101])) {
        echo '<a class="touch-link" href="chat.php?action=prodel">Очистить чат</a><form method="post" action="chat.php?action=restatement">';motor_form_token();
        echo '<input type="hidden" name="version" value="'.$version.'"><input type="submit" value="Пересчитать сообщения"></form>';
    }
}
echo '<p><a class="touch-link" href="index.php">В админку</a> / <a class="touch-link" href="../index.php">На главную</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
