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

//-------------------- Вывод статистики ------------------------------//
$counter_online = motor_info_online()['total'];

$counter_host=motor_info_traffic_current('host')['day'];
$counter_hits=motor_info_traffic_current('hits')['day'];

$img = imageCreateFromGIF(BASEDIR.'images/img/counter.gif');
$color = imagecolorallocate($img, 169,169,169);
$color2 = imagecolorallocate($img, 102,102,102);

if ($counter_online >= 0 && $counter_online < 10) $pos = 66;
if ($counter_online >= 10 && $counter_online< 100) $pos = 58;
if ($counter_online >= 100 && $counter_online < 1000) $pos = 48;
if ($counter_online >= 1000) $pos = 40;

ImageString($img, 1, 4, 8, $counter_host, $color);
ImageString($img, 1, 4, 15, $counter_hits, $color);
ImageString($img, 6, $pos, 8, $counter_online, $color2);

Header("Content-type: image/gif");
ImageGIF($img);
ImageDestroy($img);
?>
