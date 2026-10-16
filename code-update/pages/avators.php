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

if (isset($_GET['start'])){$start = (int)$_GET['start'];} else {$start = 0;}
if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Галерея аватаров</b><br /><br />';

if (is_user()){

############################################################################################
##                                    Главная страница                                    ##
############################################################################################
if($action==""){

echo '<b>Выбрать</b> | <a href="avators.php?action=buy&amp;'.SID.'">Купить</a> | <a href="avators.php?action=load&amp;'.SID.'">Загрузить</a><br /><br />';

$array_avators = array();
$globavatars = glob(BASEDIR."images/avators/*.gif");
foreach ($globavatars as $filename) {
if(basename($filename)=="noavatar.gif" || basename($filename)=="guest.gif") continue;
$array_avators[] = basename($filename);
}

natsort($array_avators); $array_avators = array_values($array_avators);
$total = count($array_avators);
if ($total>0){

if ($start < 0 || $start > $total){$start = 0;}
if ($total < $start + $config['avlist']){ $end = $total; }
else {$end = $start + $config['avlist']; }
echo '<div class="avatar-grid">';
for ($i = $start; $i < $end; $i++){

echo '<form class="avatar-card" action="avators.php?action=select" method="post">'.motor_avatar_image('images/avators/'.$array_avators[$i],96);
motor_form_token();
echo '<input type="hidden" name="av" value="'.htmlspecialchars($array_avators[$i],ENT_QUOTES,'UTF-8').'"><button type="submit">Выбрать</button></form>';
}
echo '</div>';

page_jumpnavigation('avators.php?', $config['avlist'], $start, $total);
page_strnavigation('avators.php?', $config['avlist'], $start, $total);


echo '<hr />Выберите понравившийся вам аватар<br />';
echo 'Cейчас ваш аватар: '.user_avatars($log).'<br /><br />';
echo 'Всего аваторов: <b>'.(int)$total.'</b><br />'; 

} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>В данной категории аватаров нет!</b><br />';}
}

############################################################################################
##                                    Выбор аватара                                       ##
############################################################################################
if ($action=="select"){
motor_form_guard(['av']);

$uid = $_POST['uid'];
$av = $_POST['av'];

if ($uid==$_SESSION['token']){
if (preg_match('/^(?:[1-9][0-9]?|1[0-9]{2}|200)\.gif$/D', $av)){
if (file_exists(BASEDIR."images/avators/$av")){
if ($udata[43]!="images/avators/$av"){
if ($av!="noavatar.gif" && $av!="guest.gif"){

change_profil($log, array(43=>"images/avators/$av"));

if (file_exists(DATADIR.'dataavators/'.$log.'.gif')) {unlink (DATADIR.'dataavators/'.$log.'.gif');}

echo '<br />Аватар успешно выбран!<br />';
echo 'Cейчас ваш аватар: '.user_avatars($log).'<br />';

} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Данный аватар выбрать нельзя!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Вы уже выбрали это аватар!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Такого аватара не существует!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Недопустимое название аватара!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Неверный идентификатор сессии, повторите действие!</b><br />';}

echo '<br /><img src="../images/img/back.gif" alt="image" /> <a href="avators.php?'.SID.'">Вернуться</a>';
}

############################################################################################
##                                    Платные аватары                                     ##
############################################################################################
if($action=="buy"){

echo '<a href="avators.php?'.SID.'">Выбрать</a> | <b>Купить</b> | <a href="avators.php?action=load&amp;'.SID.'">Загрузить</a><br /><br />';

$array_avators = array();
$globavatars = glob(BASEDIR."images/avators2/*.gif");
foreach ($globavatars as $filename) {
$array_avators[] = basename($filename);
}

natsort($array_avators); $array_avators = array_values($array_avators);
$total = count($array_avators);
if ($total>0){

if ($start < 0 || $start > $total){$start = 0;}
if ($total < $start + $config['avlist']){ $end = $total; }
else {$end = $start + $config['avlist']; }
echo '<div class="avatar-grid">';
for ($i = $start; $i < $end; $i++){

echo '<form class="avatar-card" action="avators.php?action=addbuy" method="post">'.motor_avatar_image('images/avators2/'.$array_avators[$i],96);
motor_form_token();
echo '<input type="hidden" name="av" value="'.htmlspecialchars($array_avators[$i],ENT_QUOTES,'UTF-8').'"><button type="submit">Купить</button></form>';
}
echo '</div>';

page_jumpnavigation('avators.php?action=buy&amp;', $config['avlist'], $start, $total);
page_strnavigation('avators.php?action=buy&amp;', $config['avlist'], $start, $total);

echo '<hr />Цена аватара '.moneys($config['avatarpay']).'<br />';
echo 'В наличии: '.moneys($udata[41]).'<br />';
echo 'Купите понравившийся вам аватар<br />';
echo 'Cейчас ваш аватар: '.user_avatars($log).'<br /><br />';
echo 'Всего аваторов: <b>'.(int)$total.'</b><br />'; 

} else {echo '<img src="../images/img/reload.gif" alt="image" /> <b>В данной категории аватаров нет!</b><br />';}
}

############################################################################################
##                                    Покупка аватара                                     ##
############################################################################################
if($action=="addbuy"){
motor_form_guard(['av']);

$uid = $_POST['uid'];
$av = $_POST['av'];

if ($uid==$_SESSION['token']){
if (preg_match('/^(?:[1-9][0-9]?|1[0-9]{2}|200)\.gif$/D', $av)){
if (file_exists("../images/avators2/$av")){
if ($udata[43]!="images/avators2/$av"){
if ($udata[41]>=$config['avatarpay']){	

change_profil($log, array(41=>$udata[41]-$config['avatarpay'], 43=>"images/avators2/$av"));

if (file_exists(DATADIR.'dataavators/'.$log.'.gif')){ unlink (DATADIR.'dataavators/'.$log.'.gif'); }

echo '<br />Аватар успешно куплен!<br />';
echo 'Cейчас ваш аватар: '.user_avatars($log).'<br />';
echo 'C вашего счета списано '.moneys($config['avatarpay']).'<br />';

} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Недостаточно средств на счету</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Вы уже купили это аватар!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Такого аватара не существует!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Недопустимое название аватара!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Неверный идентификатор сессии, повторите действие!</b><br />';}

echo '<br /><img src="../images/img/back.gif" alt="image" /> <a href="avators.php?action=buy&amp;'.SID.'">Вернуться</a>';
}

############################################################################################
##                              Подготовка к загрузке аватара                             ##
############################################################################################
if($action=="load"){

echo '<a href="avators.php?'.SID.'">Выбрать</a> | <a href="avators.php?action=buy&amp;'.SID.'">Купить</a> | <b>Загрузить</b><br /><br />';

echo 'В наличии: '.moneys($udata[41]).'<br />';

if ($udata[36]>=$config['avatarpoints']){		
if ($udata[41]>=$config['avatarupload']){

echo '<form action="avators.php?action=addload&amp;'.SID.'" method="post" name="form" enctype="multipart/form-data">';
motor_form_token();
echo '<br />Прикрепить аватар:<br />';
echo '<input type="file" name="file" /><br /><br />';
echo '<input type="submit" value="Загрузить" /></form><hr />';

} else {echo '<b>У вас недостаточное количество денег на счету для загрузки аватара!</b><br /><br />';}
} else {echo '<b>У вас недостаточное количество баллов, необходимо более '.(int)$config['avatarpoints'].' баллов!</b><br /><br />';}

echo 'Cейчас ваш аватар: '.user_avatars($log).'<br />';
echo 'Стоимость загрузки аватара составляет '.moneys($config['avatarupload']).'<br />';
echo 'Внимание! На загрузку аватаров установлены строгие ограничения<br />';
echo 'Загружать аватары могут только пользователи у которых более '.(int)$config['avatarpoints'].' баллов<br />';
echo 'Размер аватара должен быть '.(int)$config['avatarsize'].'*'.(int)$config['avatarsize'].' px, вес не более чем '.formatsize($config['avatarweight']).'<br />';
echo 'Расширение аватаров в формате .gif (в нижнем регистре)<br /><br />';
}

############################################################################################
##                                    Загрузка аватара                                    ##
############################################################################################
if($action=="addload"){
motor_form_guard([]);
$file = $_FILES['file'] ?? null;
if (!is_array($file) || !isset($file['tmp_name'],$file['name'],$file['size'],$file['error']) ||
    !is_string($file['tmp_name']) || !is_string($file['name']) || $file['error'] !== UPLOAD_ERR_OK ||
    !is_uploaded_file($file['tmp_name']) || $file['size'] <= 0 || $file['size'] > (int)$config['avatarweight']) {
    http_response_code(400); echo '<p>Не удалось принять аватар. Проверьте файл и ограничение размера.</p>'; include "../themes/".$config['themes']."/foot.php";
}


$uid = $_POST['uid'];
$avat_size = $_FILES['file']['size'];
$avat_name = $_FILES['file']['name'];
$size = @getimagesize($_FILES['file']['tmp_name']);
$av_file = file_get_contents($_FILES['file']['tmp_name']);
$av_string = substr($av_file, 0, 3);

if ($uid==$_SESSION['token']){
if (strrchr($avat_name, '.')=='.gif'){
if ($av_string=='GIF' && $size && $size[2] === IMAGETYPE_GIF){
if ($avat_size>0 && $avat_size<=$config['avatarweight']){
if ($size[0]==$config['avatarsize'] && $size[1]==$config['avatarsize']){
if ($udata[41]>=$config['avatarupload']){
if ($udata[36]>=$config['avatarpoints']){
	
if (move_uploaded_file($_FILES['file']['tmp_name'], DATADIR.'dataavators/'.$log.'.gif')){
@chmod(DATADIR.'dataavators/'.$log.'.gif', 0666);	

change_profil($log, array(41=>$udata[41]-$config['avatarupload'], 43=>"gallery/avators.php?uz=$log"));

echo '<br />Аватар успешно загружен!<br />';
echo 'Cейчас ваш аватар: '.user_avatars($log).'<br />';
echo 'C вашего счета списано '.moneys($config['avatarupload']).'<br /><br />';

} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Не удалось загрузить аватар!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Недостаточное количество баллов, необходимо более '.(int)$config['avatarpoints'].' баллов</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! На вашем счете недостаточно средств!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Размер аватара должен быть '.(int)$config['avatarsize'].'*'.(int)$config['avatarsize'].' px</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Вес аватара должен быть не более чем '.formatsize($config['avatarweight']).'</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Разрешается загружать аватары только в формате .gif</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Разрешается загружать аватары только в формате .gif</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Ошибка! Неверный идентификатор сессии, повторите действие!</b><br />';}

echo '<br /><img src="../images/img/back.gif" alt="image" /> <a href="avators.php?action=load&amp;'.SID.'">Вернуться</a>';
}

} else {show_login('Вы не авторизованы, чтобы изменить аватар, необходимо');}
	
echo '<br /><img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a>';

include_once"../themes/".$config['themes']."/foot.php";
?>