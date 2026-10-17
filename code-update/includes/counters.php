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
if (!defined('BASEDIR')) { header("Location:../index.php"); exit; }

$found=motor_info_presence();
$lastTraffic=motor_info_traffic_state('hits',SITETIME)[1];
$newDay=date('Y-m-d',$lastTraffic)!==date('Y-m-d',SITETIME);
motor_info_traffic_tick('hits',1);
motor_info_traffic_tick('host',(!$found || $newDay)?1:0);

//-------------------------- Онлайн ------------------------------//
if ($config['onlines']==1){

$online=motor_info_online();
$counter_online=$online['total'];$counter_reg=$online['registered'];

echo '<a href="'.BASEDIR.'pages/online.php?'.SID.'">На сайте: '.$counter_reg.'/'.$counter_online.'</a><br />';
}

//----------------------- Статистика ----------------------------//
if ($config['incount']>0){

$hosts=motor_info_traffic_current('host');$hits=motor_info_traffic_current('hits');
$counter_host=$hosts['day'];$counter_all=$hosts['all'];$counter_hits=$hits['day'];$counter_allhits=$hits['all'];

if ($config['incount']==1){ echo '<a href="'.BASEDIR.'pages/counter.php?'.SID.'">'.$counter_host.' | '.$counter_all.'</a><br />';}
if ($config['incount']==2){ echo '<a href="'.BASEDIR.'pages/counter.php?'.SID.'">'.$counter_hits.' | '.$counter_allhits.'</a><br />';}
if ($config['incount']==3){ echo '<a href="'.BASEDIR.'pages/counter.php?'.SID.'">'.$counter_host.' | '.$counter_hits.'</a><br />';}
if ($config['incount']==4){ echo '<a href="'.BASEDIR.'pages/counter.php?'.SID.'">'.$counter_all.' | '.$counter_allhits.'</a><br />';}
if ($config['incount']==5){ echo '<a href="'.BASEDIR.'pages/counter.php?'.SID.'"><img src="'.BASEDIR.'gallery/count.php" alt="image" /></a><br />';}
}
?>
