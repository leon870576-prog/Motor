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
include_once ("../themes/".$config['themes']."/index.php");
    
if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

require_once '../includes/recovery.php';
require_once '../includes/attachments.php';
motor_media_request_guard();
show_title('partners.gif', 'Восстановление пароля');

if (!is_user()){

############################################################################################
##                                    Главная страница                                    ##
############################################################################################
if ($action==""){

if (isset($_COOKIE['cookname'])) {$cookname = check($_COOKIE['cookname']);} else {$cookname = "";}

echo 'Введите свой логин и код для проверки<br />';
echo 'Инструкция по восстановлению будет выслана на электронный адрес указанный в профиле<br />';
echo 'Восстанавливать пароль можно не чаще чем раз в 12 часов<br /><br />';

echo '<form method="post" action="lostpassword.php?action=send&amp;'.SID.'">';
echo 'Логин:<br />';
echo '<input name="uz" type="text" maxlength="20" value="'.$cookname.'" /><br />';
echo 'Проверочный код: ';
if ($config['protectimg']==1){
echo '<img class="captcha-image" src="'.BASEDIR.'gallery/protect.php?v=captcha1&amp;'.SID.'" width="252" height="96" alt="Проверочный код: четыре цифры" /><br />';
} else {
echo '<b>'.$_SESSION['protect'].'</b><br />';
}
echo '<input name="provkod" inputmode="numeric" autocomplete="off" aria-label="Проверочный код" maxlength="6" /><br /><br />';
echo '<input value="Получить пароль" type="submit" /></form><hr />';

}

############################################################################################
##                            Подтверждение восстановления                                ##
############################################################################################
if($action=="send"){

$uz = check($_POST['uz']);
$provkod = (int)$_POST['provkod'];

if ($uz!=""){
if (preg_match('|^[a-z0-9\-]+$|i',$uz)){
if ($_SESSION['protect']==$provkod){
if (file_exists(DATADIR."profil/$uz.prof")){

$uzdata = reading_profil($uz);
if (motor_recovery_expiry($uzdata[35])<SITETIME){

$_SESSION['protect'] = "";
unset($_SESSION['protect']);

[$restore_key,$restore_stored]=motor_recovery_issue(SITETIME);

$sent=false;

//---------------- Инструкция по восстановлению пароля на E-mail --------------------------//
if ($uzdata[4]!=""){
$sent=addmail($uzdata[4], "Подтверждение восстановления пароля на сайте ".$config['title'], "Здравствуйте, ".$uzdata[0]." \nВами была произведена операция по восстановлению пароля на сайте ".$config['home']." \n\nДанные отправителя: \nIp: $ip \nБраузер: $brow \nОтправлено: ".date('j.m.y / H:i',SITETIME)."\n\nДля того чтобы восстановить пароль, вам необходимо перейти по ссылке: \n\n".$config['home']."/mail/lostpassword.php?action=restore&uz=".$uzdata[0]."&key=".$restore_key." \n\nЕсли это письмо попало к вам по ошибке или вы не собираетесь восстанавливать пароль, то просто проигнорируйте его");
}

if(!$sent){http_response_code(503);show_error('Отправка почты сейчас недоступна. Обратитесь к администратору. Пароль и ключ восстановления не изменены.');include '../themes/'.$config['themes'].'/foot.php';exit;}
change_profil($uz, array(35=>$restore_stored));
echo 'Письмо с инструкцией по востановлению пароля успешно выслано на E-mail указанный в профиле<br />';
echo 'Внимательно прочтите письмо и выполните все необходимые действия для восстановления пароля<br />';
echo 'Восстанавливать пароль можно не чаще чем раз в 12 часов<br />';

} else {show_error('Ошибка, с момента последнего восстановления пароля прошло менее 12 часов!');}
} else {show_error('Ошибка, пользователя с данным логином не зарегестрирован!');}
} else {show_error('Проверочное число не совпало с данными на картинке!');}
} else {show_error('Недопустимые символы в названии логина!');}
} else {show_error('Ошибка, вы не ввели логин для восстановления!');}

echo'<br /><img src="../images/img/back.gif" alt="image" /> <a href="lostpassword.php?'.SID.'">Вернуться</a>';
}

############################################################################################
##                                Восстановление пароля                                   ##
############################################################################################
if($action=="restore"){

$uz = check($_GET['uz']??'');
$key = check($_GET['key']??'');

if ($uz!=""){
if ($key!=""){
if (preg_match('|^[a-z0-9\-]+$|i',$uz)){
if (file_exists(DATADIR."profil/$uz.prof")){

$uzdata = reading_profil($uz);

if (motor_recovery_valid($uzdata[35],$key,SITETIME)){
if($_SERVER['REQUEST_METHOD']!=='POST'){
    echo '<p>Подтвердите восстановление: задайте новый пароль.</p><form method="post">';motor_form_token();
    echo '<label>Новый пароль<input type="password" name="newpar" required minlength="3" maxlength="20" autocomplete="new-password"></label><label>Повторите пароль<input type="password" name="newpar2" required minlength="3" maxlength="20" autocomplete="new-password"></label><button type="submit">Сохранить новый пароль</button></form>';
    include '../themes/'.$config['themes'].'/foot.php';exit;
}


motor_form_guard(['newpar','newpar2']);$newpass=$_POST['newpar'];
if($newpass!==$_POST['newpar2'] || $newpass===$uz || !preg_match('/^[a-z0-9-]{3,20}$/Di',$newpass) || ctype_digit($newpass)){
    http_response_code(400);show_error('Пароли должны совпадать: 3–20 латинских букв, цифр или дефисов; не только цифры и не логин.');include '../themes/'.$config['themes'].'/foot.php';exit;
}
// Preserve the existing password format while invalidating the old sessions and one-time key.
change_profil($uz, array(1=>md5(md5($newpass)),35=>'',25=>0));

header ("Location: ../index.php?isset=lostpass&".SID); exit;

} else {show_error('Ошибка, секретный код в ссылке не совпадает с данными в профиле!');}
} else {show_error('Ошибка, пользователя с данным логином не зарегестрирован!');}
} else {show_error('Недопустимые символы в названии логина!');}
} else {show_error('Ошибка, отсутствует секретный код в ссылке для восстановления пароля!');}
} else {show_error('Ошибка, отсутствует логин в ссылке для восстановления пароля!');}
}

} else {show_error('Ошибка! Вы авторизованы, восстановление пароля невозможно!');}

echo '<br /><img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a><br />';

include_once ("../themes/".$config['themes']."/foot.php");
?>