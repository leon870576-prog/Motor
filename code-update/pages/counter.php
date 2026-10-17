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

$hour = date("G",SITETIME);
$hday = date("j",SITETIME)-1;

if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

############################################################################################
##                                   Вывод статистики                                     ##
############################################################################################
if ($action=="") {

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Количество посещений</b><br /><br />';

$online=motor_info_online();
$counter_online=$online['total'];$counter_reg=$online['registered'];$substr_count=$online['guests'];

$hosts=motor_info_traffic_current('host');$hits=motor_info_traffic_current('hits');
$counter_host=$hosts['day'];$counter_all=$hosts['all'];$counter_hourhost=$hosts['hour'];
$counter_hits=$hits['day'];$counter_allhits=$hits['all'];$counter_hourhits=$hits['hour'];
$allhost24=array_sum(motor_info_traffic_series('host',24));$allhits24=array_sum(motor_info_traffic_series('hits',24));
$allhost31=array_sum(motor_info_traffic_series('host',31));$allhits31=array_sum(motor_info_traffic_series('hits',31));

echo 'Всего посетителей на сайте: <b>'.(int)$counter_online.'</b><br />';
echo 'Всего авторизованных: <b>'.(int)$counter_reg.'</b><br />';
echo 'Всего гостей: <b>'.(int)$substr_count.'</b><br /><br />';

echo 'Хостов сегодня: <b>'.(int)$counter_host.'</b><br />';
echo 'Хитов сегодня: <b>'.(int)$counter_hits.'</b><br />';
echo 'Всего хостов: <b>'.(int)$counter_all.'</b><br />';
echo 'Всего хитов: <b>'.(int)$counter_allhits.'</b><br /><br />';

echo 'Хостов за текущий час: <b>'.(int)$counter_hourhost.'</b><br />';
echo 'Хитов за текущий час: <b>'.(int)$counter_hourhits.'</b><br /><br />';

echo 'Хостов за 24 часа: <b>'.(int)$allhost24.'</b><br />';
echo 'Хитов за 24 часа: <b>'.(int)$allhits24.'</b><br /><br />';

echo 'Хостов за 31 день: <b>'.(int)$allhost31.'</b><br />';
echo 'Хитов за 31 день: <b>'.(int)$allhits31.'</b><br /><br />';

echo 'Динамика за сутки<br />';
echo '<img src="'.BASEDIR.'gallery/count24.php" alt="image" /><br /><br />';

echo 'Динамика за 31 день<br />';
echo '<img src="'.BASEDIR.'gallery/count31.php" alt="image" /><br /><br />';

echo '<a href="counter.php?action=count24&amp;'.SID.'">Статистика по часам</a><br />';
echo '<a href="counter.php?action=count31&amp;'.SID.'">Статистика по дням </a><br />';
}

if ($action==='count24' || $action==='count31') {
    $size=$action==='count24'?24:31;
    echo '<b>'.($size===24?'Статистика за 24 часа':'Статистика за 31 день').'</b><br />';
    echo '<img src="../gallery/count'.$size.'.php" alt="График посещений" /><br />';
    foreach(['hits'=>'Хиты','host'=>'Хосты'] as $kind=>$label){
        echo '<h3>'.$label.'</h3>';
        foreach(motor_info_traffic_series($kind,$size) as $at=>$n)echo date_fixed($at,$size===24?'d.m H:i':'d.m.y').' — <b>'.$n.'</b><br />';
    }
    echo '<br /><a href="counter.php">Вернуться</a><br />';
}
echo '<a href="../index.php">На главную</a>';

include_once"../themes/".$config['themes']."/foot.php";
?>
