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

$daytime=date("d",SITETIME);
$montime=date("d.m",SITETIME);

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Онлайн пользователей</b><br /><br />';

$array_users = array();
$forum_shet = 0;
$chat_shet = 0;
$news_shet = 0;
$down_shet = 0;
$book_shet = 0;
$games_shet = 0;
$library_shet = 0;
$gallery_shet = 0;
$index_shet = 0;
$online_shet = 0;

$online=motor_info_online();
foreach($online['rows'] as $entry){
    $login=$entry[2];if($login==='')continue;
    $array_users[]=$login;$online_shet++;
    $life=explode('|',motor_info_read(DATADIR.'datalife/'.$login.'.dat'));
    $location=(string)($life[3]??'');
    if(str_starts_with($location,'forum/'))$forum_shet++;
    elseif(str_starts_with($location,'chat/'))$chat_shet++;
    elseif(str_starts_with($location,'news/'))$news_shet++;
    elseif(str_starts_with($location,'book/'))$book_shet++;
    elseif(str_starts_with($location,'games/'))$games_shet++;
    elseif(str_starts_with($location,'gallery/'))$gallery_shet++;
    elseif($location==='index.php')$index_shet++;
}
echo 'Всего на сайте: <b>'.$online['total'].'</b><br />';
echo 'Пользователей: <b>'.$online_shet.'</b>; гостей: <b>'.$online['guests'].'</b><br />';

echo '<a href="'.BASEDIR.'index.php?'.SID.'">На главной:</a>  '.(int)$index_shet.'<br />';
echo '<a href="'.BASEDIR.'forum/?'.SID.'">В форуме:</a> '.(int)$forum_shet.'<br />';
echo '<a href="'.BASEDIR.'chat/?'.SID.'">В мини-чате:</a> '.(int)$chat_shet.'<br />';
echo '<a href="'.BASEDIR.'book/?'.SID.'">В гостевой:</a> '.(int)$book_shet.'<br />';
echo '<a href="'.BASEDIR.'news/?'.SID.'">В новостях:</a> '.(int)$news_shet.'<br />';
echo '<a href="'.BASEDIR.'download/?'.SID.'">В загрузках:</a> '.(int)$down_shet.'<br />';
echo '<a href="'.BASEDIR.'index.php?action=arkada&amp;'.SID.'">В развлечениях:</a>  '.(int)$games_shet.'<br />';
echo '<a href="'.BASEDIR.'library/?'.SID.'">В библиотеке:</a> '.(int)$library_shet.'<br />';
echo '<a href="'.BASEDIR.'gallery/?'.SID.'">В галерее:</a> '.(int)$gallery_shet.'<br />';

echo '<br /><b>Пользователи на сайте:</b><br />';

foreach($array_users as $key=>$value){
if($key==0){
echo '<b><a href="../pages/anketa.php?uz='.$value.'&amp;'.SID.'">'.nickname($value).'</a></b>';
}else{
echo ', <b><a href="../pages/anketa.php?uz='.$value.'&amp;'.SID.'">'.nickname($value).'</a></b>';
}
}

$profiles=motor_info_profiles();$arr_happy=[];
foreach($profiles as $login=>$d)if(substr($d[18],0,5)===date_fixed(SITETIME,'d.m'))$arr_happy[]=$login;
echo '<br /><hr /><b>Сегодняшние именинники:</b><br />';
$counthappy = count($arr_happy);

if ($counthappy>0){
echo 'Сегодня отмечают свой день рождения '.(int)$counthappy.' чел.<br />';

foreach($arr_happy as $key=>$value){
if ($value!==""){
if ($key==0){
echo '<b><a href="../pages/anketa.php?uz='.$value.'&amp;'.SID.'"><span style="color:#ff0000">'.nickname($value).'</span></a></b>';
} else {
echo ', <b><a href="../pages/anketa.php?uz='.$value.'&amp;'.SID.'"><span style="color:#ff0000">'.nickname($value).'</span></a></b>';
}}}

} else {echo '<b>Именинников нет!</b><br />';}

//---------------------------------------------------------------------------------//
echo '<hr /><b>Приветствуем новичков:</b><br />';
$arr_newuser=[];
foreach($profiles as $login=>$d)if(date_fixed((int)$d[6],'Y-m-d')===date_fixed(SITETIME,'Y-m-d'))$arr_newuser[]=$login;
$countnewuser=count($arr_newuser);

if($countnewuser>0){
echo 'Сегодня зарегистрировались на сайте '.(int)$countnewuser.' чел.<br />';

foreach($arr_newuser as $key=>$value){
if ($value!=""){
if ($key==0){
echo '<b><a href="../pages/anketa.php?uz='.check($value).'&amp;'.SID.'"><span style="color:#ff0000">'.check(nickname($value)).'</span></a></b>';
} else {
echo ', <b><a href="../pages/anketa.php?uz='.check($value).'&amp;'.SID.'"><span style="color:#ff0000">'.check(nickname($value)).'</span></a></b>';
}}}
} else {echo '<b>Новичков нет!</b>';}


echo '<br /><br /><img src="../images/img/chat.gif" alt="image" /> <a href="who.php?'.SID.'">Kто-где?</a><br />';
echo '<img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a> ';
include_once "../themes/".$config['themes']."/foot.php";
?>
