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
require_once ("includes/start.php");
require_once ("includes/functions.php");
require_once ("includes/header.php");

sleep(1);
if(($_GET['action']??'')==='' && $_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);header('Allow: POST');exit('Используйте форму входа.');}
if (isset($_POST['login'])) {$login = check($_POST['login']);} else {$login = check($_GET['login'] ?? '');}
if (isset($_POST['pass'])) {$pass = check($_POST['pass']);} else {$pass = check($_GET['pass'] ?? '');}
if (isset($_POST['cookietrue'])) {$cookietrue = (int)$_POST['cookietrue'];} else {$cookietrue = (int)($_GET['cookietrue'] ?? 0);}
if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

############################################################################################
##                                       Авторизация                                      ##
############################################################################################
if ($action==""){
if (preg_match('|^[a-z0-9\-]+$|i',$login) && preg_match('|^[a-z0-9\-]+$|i',$pass)){
if (file_exists(DATADIR."profil/$login.prof")){

/* АПГРЕЙД из 18 в 19 версию */
include_once ("includes/upgrade_pass_19ver.php");
/* АПГРЕЙД из 18 в 19 версию */

$inform = motor_info_read(DATADIR."profil/$login.prof");
$info = explode(":||:",$inform);

if ($login==$info[0] && md5(md5($pass))==$info[1]) {

session_regenerate_id(true);
$_SESSION['token']=bin2hex(random_bytes(32));
$cookieOptions=['expires'=>time()+3600*24*365,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Lax'];
if ($cookietrue==1){

$apar = xoft_encode($pass,$config['keypass']);
$alog = xoft_encode($login,$config['keypass']);

setcookie("cookpar", $apar, $cookieOptions);
setcookie("cooklog", $alog, $cookieOptions);
}
setcookie("cookname", $login, $cookieOptions);

$pr_ip = explode(".",$ip_addr);
$my_ip = $pr_ip[0].$pr_ip[1].$pr_ip[2];

$_SESSION['log'] = $login;
$_SESSION['par'] = $pass;
$_SESSION['my_ip'] = $my_ip;

increment_profil($login,[11=>1],[14=>$ip,25=>1,44=>SITETIME]);

header ("Location: index.php?".SID); exit;
}}}
header ("Location: pages/login.php?isset=inputoff"); exit;
}

############################################################################################
##                                           Выход                                        ##
############################################################################################
if ($action=="exit"){
if($_SERVER['REQUEST_METHOD']==='GET'){
    include 'themes/'.$config['themes'].'/index.php';
    echo '<h1>Выход с сайта</h1><form method="post">';motor_form_token();echo '<button type="submit">Выйти из учётной записи</button></form><p><a href="index.php">Остаться на сайте</a></p>';
    include 'themes/'.$config['themes'].'/foot.php';exit;
}


if (is_user()) {
change_profil($log, array(25=>0));
}

unset($_SESSION['log']);
unset($_SESSION['par']);
setcookie('cookpar', '');
setcookie('cooklog', '');
session_unset();
setcookie(session_name(), '');
session_destroy();
header ("Location: index.php?isset=exit"); exit;
}

?>
