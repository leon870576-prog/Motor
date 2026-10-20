<?php
#-----------------------------------------------------#
#          ********* WAP-MOTORS *********             #
#             Made by   :  VANTUZ                     #
#               E-mail  :  visavi.net@mail.ru         #
#                 Site  :  http://pizdec.ru           #
#             WAP-Site  :  http://visavi.net          #
#                  ICQ  :  36-44-66                   #
#  Вы не имеете право вносить изменения в код скрипта #
#        для его дальнейшего распространения          #
#-----------------------------------------------------#	
require_once "../includes/start.php";
require_once "../includes/functions.php";
require_once "../includes/header.php";
include_once "../themes/".$config['themes']."/index.php";

if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

if (!is_user() && $action=='menu'){header ('Location: '.BASEDIR.'index.php?'.SID); exit;}
if ($action=='index'){header ('Location: '.BASEDIR.'index.php?'.SID); exit;}
if(in_array($action,['reklama_head','reklama_foot'],true)){header('Location: '.BASEDIR.'index.php#motor-ad-'.($action==='reklama_head'?'head':'foot'));exit;}
if ($action==='menu' && is_user()) echo '<p><a class="touch-link" href="userpage.php">Моя страница: фото, новости и отзывы</a></p>';

if (preg_match('|^[a-z0-9_\-]+$|i', $action)){
$motorDatFile=$action.'.dat';echo '<section class="dat-page" data-dat-page="'.htmlspecialchars($motorDatFile,ENT_QUOTES,'UTF-8').'">';
include BASEDIR.'includes/dat-page-output.php';echo '</section>';
} else { echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка, недопустимое название страницы!</b><br />'; }

echo '<br /><img src="'.BASEDIR.'images/img/act_home.gif" alt="image" /> <a href="'.BASEDIR.'index.php?'.SID.'">На главную</a>';

include_once "../themes/".$config['themes']."/foot.php";
?>
