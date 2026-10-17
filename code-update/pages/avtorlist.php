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

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Рейтинг авторитетов</b><br /><br />';

############################################################################################
##                                       Запись в кэш                                     ##
############################################################################################
$profiles=motor_info_profiles();uasort($profiles,fn($a,$b)=>(int)$b[49]<=>(int)$a[49] ?: strcmp($a[0],$b[0]));
$file=[];$rank=0;foreach($profiles as $d){$rank++;$file[]='|'.$rank.'|'.$d[0].'|'.(int)$d[49].'|'.(int)$d[50].'|'.(int)$d[51].'|'.(int)$d[6].'|';}
if(true){
$total = count($file);

if ($total>0){

if ($start < 0 || $start > $total){$start = 0;}
if ($total < $start + $config['avtorlist']){ $end = $total; }
else {$end = $start + $config['avtorlist']; }
for ($i = $start; $i < $end; $i++){

$data = explode("|",$file[$i]);

echo '<div class="b">'.(int)$data[1].'. <img src="../images/img/chel.gif" alt="image" /> ';

if ($uz==$data[2]){
echo '<b><big><a href="../pages/anketa.php?uz='.$data[2].'&amp;'.SID.'"><span style="color:#ff0000">'.nickname($data[2]).'</span></a></big></b> (Авторитет: '.(int)$data[3].')</div>';
} else {
echo '<b><a href="../pages/anketa.php?uz='.$data[2].'&amp;'.SID.'">'.nickname($data[2]).'</a></b> (Авторитет: '.(int)$data[3].')</div>';
}

echo '<div>Плюсов: '.(int)$data[4].' | Минусов: '.(int)$data[5].'<br />Дата регистрации: '.date_fixed($data[6]).'</div>';
}

page_jumpnavigation('avtorlist.php?', $config['avtorlist'], $start, $total);
page_strnavigation('avtorlist.php?', $config['avtorlist'], $start, $total);

############################################################################################
##                                 Поиск пользователя                                     ##
############################################################################################
if ($uz==""){
echo '<hr /><b>Поиск пользователя:</b><br />';

echo '<form action="avtorlist.php?start='.$start.'&amp;'.SID.'" method="post">';
echo '<input name="uz" value="'.$log.'" />';
echo '<input type="submit" value="Искать" /></form><hr />';

} else {

$string = search_string(DATADIR."datatmp/avtorlist.dat", $uz, 2);
if ($string) {

$stranica = floor(($string[1] - 1) / $config['avtorlist']) * $config['avtorlist'];

if ($start!=$stranica){
header ("Location: avtorlist.php?start=$stranica&uz=$uz&".SID);  exit;
}

echo '<hr /><span style="color:#00ff00">Позиция в рейтинге:</span> <b>'.(int)$string[1].'</b><br />';

} else { echo '<hr /><b><span style="color:#ff0000">Пользователь с таким логином не найден!</span></b><br />';}

echo '<br /><a href="avtorlist.php?start='.$start.'&amp;'.SID.'">Искать еще</a><br />';
}

echo '<br />Всего пользователей: <b>'.(int)$total.'</b><br /><br />';

} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>Пользователей еще нет!</b><br />';}
} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>Пользователей еще нет!</b><br />';}

echo '<img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a>';

include_once ("../themes/".$config['themes']."/foot.php");
?>
