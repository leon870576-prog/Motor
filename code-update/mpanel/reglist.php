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

$config['reglist'] = 10;

if (isset($_GET['start'])) {$start = (int)$_GET['start'];} else {$start = 0;}
if (isset($_GET['action'])) {$action = check($_GET['action']);} else {$action = "";}

if (is_admin(array(101,102,103))){

##########################################################################
##                         Главная страница                             ##
##########################################################################

echo '<img src="../images/img/partners.gif" alt="image" /> <b>Ожидающие регистрации</b><br /><br />';

############################################################################################
##                                    Главная страница                                    ##
############################################################################################
if ($action==""){

if ($config['regkeys']==0) {echo '<img src="../images/img/warning.gif" alt="image" /> <b><span style="color:#ff0000">Подтверждение регистрации отключено!</span></b><br />';}
if ($config['regkeys']==1) {echo '<img src="../images/img/warning.gif" alt="image" /> <b><span style="color:#ff0000">Включено автоматическое подтверждение регистраций!</span></b><br />';}
if ($config['regkeys']==2) {echo '<img src="../images/img/warning.gif" alt="image" /> <b><span style="color:#ff0000">Включена модерация регистраций!</span></b><br />';}

if (true){
$file = motor_info_pending_rows();
$pendingRevision=hash('sha256',implode("\n",$file));
$file = array_reverse($file);
$total = count($file);

if ($total>0){

echo '<form action="reglist.php?action=choice&amp;start='.$start.'&amp;uid='.$_SESSION['token'].'&amp;'.SID.'" method="post">';
echo '<input type="hidden" name="pending_revision" value="'.$pendingRevision.'">';

if ($start < 0 || $start > $total){$start = 0;}
if ($total < $start + $config['reglist']){ $end = $total; }
else {$end = $start + $config['reglist'];}
for ($i = $start; $i < $end; $i++){

$data = explode("|",$file[$i]);

$num = $total - $i - 1;

echo '<div class="b">';
echo '<input type="checkbox" name="id[]" value="'.check($data[0]).'" /> ';
echo '<img src="../images/img/chel.gif" alt="image" /> <b><a href="../pages/userpage.php?uz='.$data[0].'&amp;'.SID.'"> '.nickname($data[0]).' </a></b>';
echo '(E-mail: '.$data[1].')</div>';

echo '<div>Зарегистрирован: '.date_fixed($data[2]).'</div>';

}

echo '<br /><select name="choice">';
echo '<option value="1">Разрешить</option>';
echo '<option value="2">Запретить</option>';
echo '</select>';

echo '<input type="submit" value="Выполнить" /></form>';

page_jumpnavigation('reglist.php?', $config['reglist'], $start, $total);
page_strnavigation('reglist.php?', $config['reglist'], $start, $total);


echo '<br /><br />Всего ожидающих: <b>'.(int)$total.'</b><br />';

} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Нет пользователей требующих подтверждения регистрации!</b><br />';}
} else {echo '<img src="../images/img/error.gif" alt="image" /> <b>Нет пользователей требующих подтверждения регистрации!</b><br />';}
}

############################################################################################
##                                        Действие                                        ##
############################################################################################
if ($action=="choice") {

$choice = (string)($_POST['choice']??'');
$ids = $_POST['id']??[];
$pending = motor_info_pending_rows();
$revision = $_POST['pending_revision']??'';
if (!is_array($ids) || !$ids || count($ids)>100 || !in_array($choice,['1','2'],true)) {
    http_response_code(400);show_error('Выберите пользователей и действие.');
} elseif (!is_string($revision) || !hash_equals(hash('sha256',implode("\n",$pending)),$revision)) {
    http_response_code(409);show_error('Список изменился. Откройте форму заново.');
} else {
    $allowed=[];foreach($pending as $row){$d=explode('|',$row);$allowed[$d[0]]=true;}
    foreach($ids as $login) if (!is_string($login) || !isset($allowed[$login])) {http_response_code(400);exit('Неверный пользователь.');}
    foreach(array_unique($ids) as $login) {
        $profile=reading_profil($login);
        if (empty($profile[46]) || (int)$profile[7]>=101) continue;
        if ($choice==='1') change_profil($login,[46=>0,47=>'']);
        else delete_users($login);
    }
    // Compatibility cache only; views and counters use the same current profiles.
    write_files(DATADIR.'datatmp/reglist.dat',implode("\r\n",motor_info_pending_rows()),1,0666);
    header('Location: reglist.php?start='.$start.'&isset='.($choice==='1'?'mp_addregusers':'mp_delregusers').'&'.SID);exit;
}

echo '<br /><img src="../images/img/back.gif" alt="image" /> <a href="reglist.php?start='.$start.'&amp;'.SID.'">Вернуться</a>';
}

echo '<br /><img src="../images/img/panel.gif" alt="image" /> <a href="index.php?'.SID.'">В админку</a><br />';
echo '<img src="../images/img/homepage.gif" alt="image" /> <a href="../index.php?'.SID.'">На главную</a><br />';

} else {header ("Location: ../index.php?isset=404&".SID); exit();}

include_once ("../themes/".$config['themes']."/foot.php");
?>
