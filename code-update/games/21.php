<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/game21.php';
require_once '../includes/game21-view.php';
header('Cache-Control: private, no-store');
$ajax=str_contains($_SERVER['HTTP_ACCEPT']??'','application/json');
$method=$_SERVER['REQUEST_METHOD']??'GET';
if (!in_array($method,['GET','HEAD','POST'],true)) {header('Allow: GET, HEAD, POST');motor_request_reject(405,'Метод не поддерживается.');}
$logged=is_user() && !empty($log);$error='';$snapshot=null;$message='';$status=200;
$max=max(0,min(999999999,(int)$config['ochkostavka']));
if ($logged) {
    try {
        if ($method==='POST') {
            $result=motor21_apply($log,(string)($_POST['command']??''),(string)($_POST['revision']??''),(string)($_POST['bet']??''),$max,motor21_legacy());
            $snapshot=$result;$message=$result['message'];$status=$result['code'];
            if (($_POST['command']??'')==='restore' && $status===200) motor21_forget_legacy();
            if (!$ajax && $status===200) {$_SESSION['game21_notice']=$message;header('Location: 21.php#g21',true,303);exit;}
        } else {
            $snapshot=motor21_snapshot($log);
            $message=(string)($_SESSION['game21_notice']??'');unset($_SESSION['game21_notice']);
        }
    } catch (InvalidArgumentException $e) { $status=400;$error=$e->getMessage(); }
      catch (Throwable $e) { $status=503;$error='Не удалось загрузить или сохранить игру. Обновите страницу перед следующим ходом.'; }
}
if ($ajax) {
    while(ob_get_level()>0)ob_end_clean();header_remove('Content-Encoding');header('Content-Type: application/json; charset=utf-8');
    if (!$logged) {$status=401;$error='Войдите на сайт, чтобы продолжить игру.';}
    http_response_code($status);
    echo json_encode(['html'=>$snapshot!==null?motor21_view($snapshot,$max,$message):null,'error'=>$error],JSON_UNESCAPED_UNICODE|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT);exit;
}
http_response_code($status);
include '../themes/'.$config['themes'].'/index.php';
?>
<link rel="stylesheet" href="../assets/lesika/game21.css?v=21r1">
<section class="g21" id="g21" aria-labelledby="g21-title">
  <header class="g21-header"><div><span class="g21-kicker">КАРТОЧНЫЙ КЛУБ</span><h1 id="g21-title">Двадцать одно<span aria-hidden="true">.</span></h1></div><span class="g21-emblem" aria-hidden="true">21</span></header>
  <p class="g21-intro">Ваш ход. Ваша удача.</p>
  <p class="g21-network" data-g21-network role="status" aria-live="polite" hidden></p>
  <?php if(!$logged){show_login('Чтобы играть в «21», необходимо');}elseif($error!==''){echo '<p class="g21-notice" role="alert">'.motor21_escape($error).'</p><a href="21.php">Обновить игру</a>';}else{echo motor21_view($snapshot,$max,$message);}?>
  <details class="g21-rules"<?=($_GET['action']??'')==='pravila'?' open':''?>><summary>Как играть <span aria-hidden="true">+</span></summary>
    <p>Это «Очко» с колодой из 36 карт. Ставки — в чатлах, внутренней валюте сайта. Карты в одной партии не повторяются.</p>
    <div class="g21-values"><span>6–10 <b>по номиналу</b></span><span>Валет <b>2</b></span><span>Дама <b>3</b></span><span>Король <b>4</b></span><span>Туз <b>11</b></span></div>
    <p>Каждый получает две карты. Нажмите «Взять карту» или «Открыться». Банкир добирает до 17 очков. При 20, 21, двух тузах или переборе вскрытие происходит автоматически.</p>
    <p>21 сильнее двух тузов (22), а два туза сильнее остальных комбинаций. Другой перебор означает проигрыш. При равенстве побеждает банкир. При победе на баланс возвращаются две ставки, включая вашу; при проигрыше теряется одна ставка.</p>
    <p>Партия сохраняется: можно вернуться к ней после закрытия страницы. Одновременно у аккаунта одна партия. Счётчик побед ведётся с обновления игры.</p>
  </details>
  <?php if($logged&&is_admin([101])):?><a class="g21-admin" href="../mpanel/setting.php?action=seteleven">Настроить лимит ставки</a><?php endif;?>
</section>
<script src="../assets/lesika/game21.js?v=21r1" defer></script>
<p><a href="../pages/index.php?action=arkada">← Другие игры</a></p>
<?php include '../themes/'.$config['themes'].'/foot.php'; ?>
