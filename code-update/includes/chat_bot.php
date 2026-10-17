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
if (!defined('BASEDIR')) { http_response_code(403);exit; }
require_once __DIR__.'/chat.php';
$namebots='Настюха';
$context=$_SESSION['nastya_context']??[];
$mssg=motor_nastya_reply((string)($msg??''),$context,motor_chat_settings(),SITETIME)??'';
$_SESSION['nastya_context']=$context;
