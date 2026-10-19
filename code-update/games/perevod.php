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
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';require_once '../includes/wallet.php';
header('Cache-Control: private, no-store');$error='';$success='';$state=null;$target=$_POST['uz']??$_GET['uz']??'';
try {
    if(!is_user())throw new RuntimeException('Войдите на сайт для перевода денег.',403);
    $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','HEAD','POST'],true))throw new RuntimeException('Метод не поддерживается.',405);
    if($method==='POST'){
        motor_form_guard([]);$result=motor_wallet_transfer($log,$target,$_POST['gold']??null,$_POST['revision']??null,SITETIME,$udata[1]);
        $success=$result['replay']?'Этот перевод уже принят. Повторного списания нет.':'Перевод успешно завершён.';
        if($result['notify'])motor_wallet_notify($log,$target,(int)$_POST['gold'],SITETIME);
    }
    $udata=reading_profil($log);$state=motor_wallet_state($udata);
} catch(Throwable $e){http_response_code(in_array($e->getCode(),[400,403,404,405,409],true)?$e->getCode():503);$error=$e->getMessage();}
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Перевод денег');$h=fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
if($error!=='')echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if($success!=='')echo '<p class="theme-success" role="status">'.$h($success).'</p>';
if($state!==null){
    echo '<p>В наличии: '.moneys($udata[41]).'</p><p>Для перевода необходимо не менее '.motor_points_min('transfer').' баллов активности. Баллы за перевод не списываются.</p>';
    $pending=!empty($state['last']['pending']);
    echo '<form method="post" action="perevod.php?action=go">';motor_form_token();
    if($pending){$l=$state['last'];echo '<p>Предыдущий перевод '.$h($l['target']).' на '.$l['amount'].' ожидает завершения. Повтор не спишет сумму второй раз.</p><input type="hidden" name="uz" value="'.$h($l['target']).'"><input type="hidden" name="gold" value="'.$l['amount'].'"><input type="hidden" name="revision" value="'.$l['revision'].'"><button class="primary" type="submit">Завершить перевод</button>';}
    else{echo '<input type="hidden" name="revision" value="'.$state['revision'].'"><label for="transfer-target">Логин получателя</label><input id="transfer-target" type="text" style="min-height:44px" name="uz" maxlength="20" required value="'.$h(is_string($target)?$target:'').'"><label for="transfer-amount">Сумма перевода</label><input id="transfer-amount" type="number" style="min-height:44px" inputmode="numeric" name="gold" min="1" max="1000000000" step="1" required><button class="primary" type="submit">Перевести</button>';}
    echo '</form>';
}
echo '<p><a href="perevod.php">Обновить форму перевода</a> · <a href="kredit.php">Кредиты</a> · <a href="../pages/userpage.php">Моя страница</a></p>';include '../themes/'.$config['themes'].'/foot.php';
