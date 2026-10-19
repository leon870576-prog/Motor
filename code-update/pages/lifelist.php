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
require_once ("../includes/start.php");
require_once ("../includes/functions.php");
require_once ("../includes/header.php");
include_once ("../themes/".$config['themes']."/index.php");

if (isset($_GET['start'])) {$start = (int)$_GET['start'];} else {$start = 0;}
if (isset($_GET['uz'])) {$uz = check($_GET['uz']);} elseif (isset($_POST['uz'])) {$uz = check($_POST['uz']);} else {$uz = "";}

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Рейтинг долгожителей</b><br /><br />';

############################################################################################
##                                       Запись в кэш                                     ##
############################################################################################
$values=[];foreach(motor_info_profiles() as $login=>$d){$life=explode('|',motor_info_read(DATADIR.'datalife/'.$login.'.dat'));$values[$login]=max(0,(int)($life[1]??0));}
arsort($values);$file=[];$rank=0;foreach($values as $login=>$seconds){$rank++;$file[]='|'.$rank.'|'.$login.'|'.$seconds.'|';}
if(true){
$total = count($file);

if ($total>0){

if ($start < 0 || $start > $total){$start = 0;}
if ($total < $start + $config['lifelist']){ $end = $total; }
else {$end = $start + $config['lifelist']; }
for ($i = $start; $i < $end; $i++){

$data = explode("|",$file[$i]);

echo '<div class="b">'.$data[1].'. <img src="../images/img/chel.gif" alt="image" /> ';

if ($uz==$data[2]){
echo '<b><big><a href="../pages/userpage.php?uz='.$data[2].'&amp;'.SID.'"><span style="color:#ff0000">'.nickname($data[2]).'</span></a></big></b> ';
} else {
echo '<b><a href="../pages/userpage.php?uz='.$data[2].'&amp;'.SID.'">'.nickname($data[2]).'</a></b> ';
}

echo user_online($data[2]).'</div>';
echo '<div>Провел на сайте: '.makestime($data[3]).'</div>';
}

page_jumpnavigation('lifelist.php?', $config['userlist'], $start, $total);
page_strnavigation('lifelist.php?', $config['userlist'], $start, $total);

############################################################################################
##                                 Поиск пользователя                                     ##
############################################################################################
if (empty($uz)){
echo '<hr /><b>Поиск пользователя:</b><br />';

echo '<form action="lifelist.php?start='.$start.'&amp;'.SID.'" method="post">';
echo '<input name="uz" value="'.$log.'" />';
echo '<input type="submit" value="Искать" /></form><hr />';

} else {

$string = search_string(DATADIR."datatmp/lifelist.dat", $uz, 2);
if ($string) {

$stranica = floor(($string[1] - 1) / $config['lifelist']) * $config['lifelist'];

if ($start!=$stranica){
header ("Location: lifelist.php?start=$stranica&uz=$uz&".SID); exit;
}

echo '<hr /><span style="color:#00ff00">Позиция в рейтинге:</span> <b>'.(int)$string[1].'</b><br />';

} else { echo '<hr /><b><span style="color:#ff0000">Пользователь с таким логином не найден!</span></b><br />';}

echo '<br /><a href="lifelist.php?start='.$start.'&amp;'.SID.'">Искать еще</a><br />';
}

echo '<br />Всего юзеров: <b>'.(int)$total.'</b><br /><br />';

} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>Пользователей еще нет!</b><br />';}
} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>Пользователей еще нет!</b><br />';}

echo '<img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a>';

include_once ("../themes/".$config['themes']."/foot.php");
?>
