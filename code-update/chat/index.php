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
$settings=motor_chat_settings();
$welcome=is_user() && empty($_SESSION['botochat']);
if (is_user()) { motor_chat_tick($settings,$welcome);$_SESSION['botochat']=1; }
$start=max(0,(int)($_GET['start']??0));
$snapshot=motor_chat_snapshot($settings,$start);
$imja=isset($_GET['imja']) && is_string($_GET['imja'])?'[b]'.safe_decode($_GET['imja']).'[/b], ':'';
include '../themes/'.$config['themes'].'/index.php';
show_title('partners.gif','Мини-чат');
echo '<link rel="stylesheet" href="../assets/lesika/chat.css?v=chat1">';
echo '<a class="touch-link" href="#form">Написать</a> / <a class="touch-link" href="index.php" data-chat-refresh>Обновить</a>';
if (is_admin([101,102,103,105])) echo ' / <a class="touch-link" href="../mpanel/chat.php">Управление</a>';
if (is_admin([101])) echo ' / <a class="touch-link" href="../mpanel/chat-settings.php">Настройки чата</a>';
echo '<div id="chat-live" data-endpoint="updates.php" data-revision="'.$snapshot['revision'].'" data-enabled="'.(int)$settings['auto_refresh'].'" data-interval="'.$settings['refresh_seconds'].'" data-start="'.$snapshot['start'].'" data-token="'.(is_user()?motor_chat_escape($_SESSION['token']):'').'">';
echo '<div class="chat-livebar"><span data-chat-status role="status">'.($settings['auto_refresh']?'Автообновление включено':'Автообновление выключено').'</span> <button type="button" class="chat-new" data-chat-new hidden>К новым сообщениям</button></div>';
echo '<section class="chat-feed" id="chat-feed" aria-label="Сообщения мини-чата">'.$snapshot['html'].'</section>';
echo '<div data-chat-navigation>'.$snapshot['navigation'].'</div></div>';
if (is_user()) {
    echo '<div class="form chat-composer" id="form" data-chat-composer><form action="add.php" method="post" data-chat-form>';
    motor_form_token();
    echo '<input type="hidden" name="message_id" value="'.bin2hex(random_bytes(16)).'">';
    echo '<label for="chat-message"><b>Сообщение:</b></label><br /><textarea id="chat-message" cols="20" rows="3" name="msg" minlength="4" maxlength="999" required data-smile-picker>'.motor_chat_escape($imja).'</textarea><br />';
    echo '<input type="submit" value="Добавить"><p class="chat-send-status" data-chat-send-status role="status"></p></form></div>';
} else { show_login('Вы не авторизованы, чтобы добавить сообщение, необходимо'); }
echo '<p><a class="touch-link" href="../pages/pravila.php">Правила</a> / <a class="touch-link" href="../pages/smiles.php">Смайлы</a> / <a class="touch-link" href="../pages/tegi.php">Теги</a></p>';
echo '<a class="touch-link" href="../index.php">На главную</a>';
echo '<script src="../assets/lesika/chat.js?v=chat1" defer></script>';
include '../themes/'.$config['themes'].'/foot.php';
