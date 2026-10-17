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
$ajax=str_contains($_SERVER['HTTP_ACCEPT']??'','application/json');
function chat_add_error(string $message,int $status): never {
    global $ajax,$config;
    if ($ajax) motor_chat_json(['error'=>$message]+($status===409?['message_id'=>bin2hex(random_bytes(16))]:[]),$status);
    http_response_code($status);header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Мини-чат</title><p>'.motor_chat_escape($message).'</p><p><a href="index.php">Вернуться в чат</a></p></html>';exit;
}
$token=$_POST['uid']??'';
if (($_SERVER['REQUEST_METHOD']??'')!=='POST' || !is_string($token) || empty($_SESSION['token']) || !hash_equals($_SESSION['token']??'',$token)) chat_add_error('Отправка отклонена. Обновите форму и повторите действие.',403);
if (!is_user()) chat_add_error('Войдите на сайт, чтобы написать сообщение.',403);
if (!isset($_POST['msg']) || !is_string($_POST['msg'])) chat_add_error('Поле сообщения должно содержать текст.',400);
$msg=check($_POST['msg']);
if (utf_strlen(trim($msg))<=3 || utf_strlen($msg)>=1000) chat_add_error('Напишите от 4 до 999 символов.',400);
$id=$_POST['message_id']??bin2hex(random_bytes(16));
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D',$id)) chat_add_error('Неверный идентификатор сообщения.',400);
if (!is_quarantine($log)) chat_add_error('Пока действует ограничение для новых участников. Попробуйте позже.',403);
$settings=motor_chat_settings();
try {
    $saved=motor_chat_transaction(function (&$rows,&$state) use ($settings,$id,$msg,$log,$brow,$ip,$udata) {
        $text=smiles(antimat(no_br($msg,'<br />')));
        foreach ($rows as $row) { $data=explode('|',$row);if (($data[9]??'')===$id) {
            if (($data[1]??'')!==$log) throw new RuntimeException('Идентификатор уже занят. Обновите форму.',409);
            if (($data[0]??'')!==$text) throw new RuntimeException('Предыдущее сообщение уже отправлено. Новый текст остался в поле — нажмите «Добавить» ещё раз.',409);
            return false;
        }}
        if ($GLOBALS['config']['floodstime']>0 && flooder($ip,$GLOBALS['php_self'])) throw new RuntimeException('Слишком частая отправка. Подождите немного и повторите.',429);
        antiflood('Location: index.php?isset=antiflood');
        $last=$rows?explode('|',end($rows)):[];
        motor_chat_append($rows,$text,$log,$brow,$ip,SITETIME,null,0,$id);
        if ($settings['quiz_enabled'] && !empty($last[8]) && SITETIME<(int)($last[7]??0) && preg_match('~(*UCP)(?<!\w)'.preg_quote(motor_nastya_plain($last[8]),'~').'(?!\w)~u',motor_nastya_plain($msg))) {
            motor_chat_append($rows,'Молодец, '.check(nickname($log)).'! Правильный ответ: [b]'.check($last[8]).'[/b]. Следующий вопрос через '.$settings['quiz_wait'].' сек.','Вундер-киндер','Бот','',SITETIME,[SITETIME+$settings['quiz_wait'],'']);
        } else {
            $context=$state['users'][$log]??[];
            $reply=motor_nastya_reply($msg,$context,$settings,SITETIME);
            if ($reply!==null) { motor_chat_append($rows,check(nickname($log).', '.$reply),'Настюха','Бот','',SITETIME);$state['users'][$log]=$context; }
        }
        motor_chat_trim($rows,$state,$settings,SITETIME);
        increment_profil($log,[12=>1,36=>1,41=>1],[14=>$ip]);
        return true;
    });
} catch (RuntimeException $e) { chat_add_error($e->getMessage(),in_array($e->getCode(),[409,429],true)?$e->getCode():503); }
if ($ajax) motor_chat_json(motor_chat_snapshot($settings)+['message_id'=>bin2hex(random_bytes(16)),'sent_message_id'=>$id,'saved'=>$saved]);
header('Location: index.php?isset=addon#chat-message-'.$id);exit;
