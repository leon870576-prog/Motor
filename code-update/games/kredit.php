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
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';require_once '../includes/wallet.php';
header('Cache-Control: private, no-store');$error='';$success='';$state=null;
try{
    if(!is_user())throw new RuntimeException('Войдите на сайт для кредитных операций.',403);
    $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','HEAD','POST'],true))throw new RuntimeException('Метод не поддерживается.',405);
    if($method==='POST'){motor_form_guard([]);$result=motor_wallet_credit($log,$_POST['oper']??null,$_POST['gold']??null,$_POST['revision']??null,$_POST['rules']??null,SITETIME,$udata[1]);$success=$result['replay']?'Эта операция уже выполнена. Повторного списания или начисления нет.':'Операция успешно выполнена.';}
    $udata=reading_profil($log);$state=motor_wallet_state($udata);$due=motor_wallet_debt($udata,SITETIME);
}catch(Throwable $e){http_response_code(in_array($e->getCode(),[400,403,404,405,409],true)?$e->getCode():503);$error=$e->getMessage();}
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Кредиты');$h=fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
if($error!=='')echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if($success!=='')echo '<p class="theme-success" role="status">'.$h($success).'</p>';
if($state!==null){
    echo '<p>В наличии: '.moneys($udata[41]).'</p>';
    if($due['debt']>0){echo '<p>Сумма к погашению: <strong>'.moneys($due['debt']).'</strong></p>';if($due['overdue'])echo '<p>Срок погашения истёк. При подтверждении операции будет учтён штраф 1%, 10 баллов активности и 1 балл авторитета. Просмотр страницы не меняет баланс. Следующий штраф возможен через 24 часа.</p>';else echo '<p>До срока погашения: '.formattime(max(0,(int)$udata[53]-SITETIME)).'</p>';}
    echo '<form method="post" action="kredit.php?action=operacia">';motor_form_token();echo '<input type="hidden" name="revision" value="'.$state['revision'].'"><input type="hidden" name="rules" value="'.motor_wallet_credit_rules().'"><label for="credit-amount">Сумма</label><input id="credit-amount" type="number" style="min-height:44px" inputmode="numeric" name="gold" min="0" max="1000000000000" step="1" required value="'.($due['debt']>0?$due['debt']:'').'"><label for="credit-operation">Операция</label><select style="min-height:44px" id="credit-operation" name="oper"><option value="1">Взять кредит</option><option value="2"'.($due['debt']>0?' selected':'').'>Погасить кредит</option>';if($due['overdue'])echo '<option value="3">Учесть просрочку без погашения</option>';echo '</select><button class="primary" type="submit">Подтвердить</button></form>';
    echo '<p>Сумма кредита: от '.moneys($config['minkredit']).' до '.moneys($config['maxkredit']).'. Комиссия — '.(int)$config['percentkredit'].'%, срок — 3 дня.</p><p>Получение кредита доступно от '.motor_points_min('credit').' баллов активности. Погашение доступно независимо от баллов.</p>';
}
echo '<p><a href="kredit.php">Обновить форму кредита</a> · <a href="perevod.php">Переводы</a> · <a href="bank.php">Банк</a> · <a href="../pages/userpage.php">Моя страница</a></p>';include '../themes/'.$config['themes'].'/foot.php';
