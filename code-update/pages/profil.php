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
require_once ("../includes/start.php");
require_once ("../includes/functions.php");
require_once ("../includes/header.php");
require_once "../includes/profile-phone.php";
include_once ("../themes/".$config['themes']."/index.php");

if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

echo '<img src="../images/img/profiles.gif" alt="image" /> <b>Мой профиль</b><br /><br />';

if (is_user()){
echo '<p><a class="touch-link up-button" href="userpage.php">Личная страница</a></p>';

############################################################################################
##                                 Главная страница                                       ##
############################################################################################	
if ($action==""){

echo '<form method="post" action="profil.php?action=edit&amp;uid='.$_SESSION['token'].'&amp;'.SID.'">';
echo 'Имя:<br /><input name="my_name" value="'.htmlspecialchars(html_entity_decode((string)($udata[29]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';
echo 'Откуда:<br /><input name="otkel" value="'.htmlspecialchars(html_entity_decode((string)($udata[2]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';
echo 'О себе:<br /><input name="infa" data-smile-picker data-smile-scope="common" value="'.htmlspecialchars(html_entity_decode((string)($udata[3]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';
echo 'Браузер:<br /><input name="mobila" value="'.htmlspecialchars(html_entity_decode((string)($udata[13]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';
echo '<label>Номер телефона<input type="tel" inputmode="tel" autocomplete="tel" name="phone" maxlength="40" value="'.htmlspecialchars((string)$udata[19],ENT_QUOTES,'UTF-8').'"></label><p>От 5 до 20 цифр; можно указать +, пробелы, скобки и дефисы. Номер будет виден в анкете. Поле можно оставить пустым.</p>';
echo 'Сайт:<br /><input name="site" value="'.htmlspecialchars(html_entity_decode((string)($udata[5]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';

echo 'Ваш аватор: '.user_avatars($log, 96).'<br />';
echo '<a href="avators.php?'.SID.'">Изменить</a> | <a href="avators.php?action=buy&amp;'.SID.'">Купить</a>  | <a href="avators.php?action=load&amp;'.SID.'">Загрузить</a><br />';

echo 'Рост (см.):<br /><input name="rost" value="'.htmlspecialchars(html_entity_decode((string)($udata[16]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';
echo 'Вес (кг.):<br /><input name="ves" value="'.htmlspecialchars(html_entity_decode((string)($udata[17]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';
echo 'День рождения (дд.мм.гг):<br /><input name="happy" value="'.htmlspecialchars(html_entity_decode((string)($udata[18]??''),ENT_QUOTES,'UTF-8'),ENT_QUOTES,'UTF-8').'" /><br />';

echo 'Пол:<br />';

echo 'M';
if ($udata[15]=="M"){echo '<input name="pol" type="radio" value="M" checked="checked" />';} else {echo '<input name="pol" type="radio" value="M" />';}
echo ' &nbsp; &nbsp; ';
if ($udata[15]=="Ж"){echo '<input name="pol" type="radio" value="Ж" checked="checked" />';} else {echo '<input name="pol" type="radio" value="Ж" />';}  
echo 'Ж<br />';

echo '<br /><input value="Изменить" type="submit" /></form><hr />';
}

############################################################################################
##                                       Изменение                                        ##
############################################################################################	
if ($action=="edit"){

$uid = check($_GET['uid']);
$my_name = check(no_br($_POST['my_name']));
$otkel = check(no_br($_POST['otkel']));
$infa = check(no_br($_POST['infa']));
$mobila = check(no_br($_POST['mobila']));
try {$phone=motor_profile_phone($_POST['phone']??$_POST['icq']??($udata[19]??''));}
catch (RuntimeException $e) {http_response_code(400);echo '<p role="alert">'.htmlspecialchars($e->getMessage(),ENT_QUOTES,'UTF-8').'</p><p><a href="profil.php">Вернуться к профилю</a></p>';include '../themes/'.$config['themes'].'/foot.php';exit;}
$pol = check(no_br($_POST['pol']));
$rost = (int)$_POST['rost'];
$ves = (int)$_POST['ves'];
$site = check($_POST['site']);
$happy = check($_POST['happy']);

if ($uid==$_SESSION['token']){
if (preg_match('#^http://([a-z0-9_\-\.])+(\.([a-z0-9\/])+)+$#', $site) || $site=="") {
if (preg_match('#^[0-9]{1,2}+\.[0-9]{2}+\.([0-9]{2}|[0-9]{4})$#', $happy) || $happy=="") {

$otkel = utf_substr($otkel,0,50);
$infa = utf_substr($infa,0,500);
$mobila = utf_substr($mobila,0,30);
$my_name = utf_substr($my_name,0,50);

change_profil($log, array(2=>$otkel, 3=>$infa, 5=>$site, 13=>$mobila, 14=>$ip, 15=>$pol, 16=>$rost, 17=>$ves, 18=>$happy, 19=>$phone, 29=>$my_name));

header ("Location: profil.php?isset=editprofil&".SID); exit;

} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Неправильный формат даты рождения, необходим формат дд.мм.гг</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Неправильный адрес сайта, необходим формата http://my_site.domen</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Неверный идентификатор сессии, повторите действие!</b><br />';}

echo'<br /><img src="../images/img/back.gif" alt="image" /> <a href="profil.php?'.SID.'">Вернуться</a><br />';
}

} else {show_login('Вы не авторизованы, чтобы изменять свои данные, необходимо');}

echo '<img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a>';

include_once ("../themes/".$config['themes']."/foot.php");
?>
