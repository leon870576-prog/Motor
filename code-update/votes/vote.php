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
require_once '../includes/voting.php';
motor_votes_lock();
include_once ("../themes/".$config['themes']."/index.php");

if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Результат голосования</b><br /><br />';

############################################################################################
##                                   Главная страница                                     ##
############################################################################################
if($action=="") {

if (file_exists(DATADIR."datavotes/votes.dat")){
$vfiles = file_get_contents(DATADIR."datavotes/votes.dat");

$vdata = explode("|", $vfiles);
$vcount = count($vdata);

$vresult = file_get_contents(DATADIR."datavotes/result.dat");
$vres = motor_votes_totals();

$sum = array_sum(array_map(fn($v)=>max(0,(int)$v),$vres));
$max = max(1,max($vres));




for($i=1; $i<$vcount; $i++){

if($vdata[$i]!=""){
$proc = round($vres[$i] * 100 / max(1,$sum));
$maxproc = round($vres[$i] * 150 / $max);

echo '<b>'.bb_code($vdata[$i]).'</b> (Голосов: '.(int)$vres[$i].')<br />';
echo '<img src="'.BASEDIR.'gallery/level.php?rat='.$maxproc.'&amp;in='.$proc.'" alt="image" /><br /><br />';
}
}

echo '<b>Всего проголосовавших: '.(int)$sum.'</b><br />';

} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>Голосование еще не создано!</b><br />';}

}

############################################################################################
##                                     Голосование                                        ##
############################################################################################
if ($action=="vote"){
motor_votes_check_revision();
if (is_user()){

if (isset($_POST['golos'])) {$golos = (int)$_POST['golos'];} elseif (isset($_GET['golos'])) {$golos = (int)$_GET['golos'];} else {$golos = "";}

try {
    if (motor_votes_submit($log,(int)$golos,(string)($_POST['poll_revision']??''))) {
        header("Location: vote.php?isset=yesvotes&".SID);exit;
    }
    show_error('Вы уже проголосовали в этом опросе!');
} catch (RuntimeException $e) {http_response_code(in_array($e->getCode(),[400,409,503],true)?$e->getCode():503);show_error(check($e->getMessage()));}

} else {show_login('Вы не авторизованы, чтобы голосовать, необходимо');}
}

echo '<br /><img src="../images/img/back.gif" alt="image" /> <a href="index.php?'.SID.'">К голосованию</a><br />';
echo '<img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a>';

include_once ("../themes/".$config['themes']."/foot.php");
?>
