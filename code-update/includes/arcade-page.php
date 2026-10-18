<?php
if(!defined('MOTOR_ARCADE_GAME')||!in_array(MOTOR_ARCADE_GAME,['bandit','kosti','naperstki'],true)){http_response_code(403);exit;}
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';require_once '../includes/arcade.php';require_once '../includes/arcade-view.php';
$id=MOTOR_ARCADE_GAME;$ajax=str_contains($_SERVER['HTTP_ACCEPT']??'','application/json');$method=$_SERVER['REQUEST_METHOD']??'GET';
header('Cache-Control: private, no-store');
if(!in_array($method,['GET','HEAD','POST'],true)){header('Allow: GET, HEAD, POST');motor_request_reject(405,'Метод не поддерживается.');}
$logged=is_user()&&!empty($log);$snapshot=null;$settings=null;$message='';$error='';$status=200;$fresh=$method!=='POST'&&($_GET['new']??'')==='1';
if($logged)try{
    $settings=motor_arcade_settings();
    if($method==='POST'){
        if(($_POST['command']??'')!=='play')throw new InvalidArgumentException('Неизвестное действие.');
        $snapshot=motor_arcade_apply($log,$id,(string)($_POST['revision']??''),(string)($_POST['rules_revision']??''),(string)($_POST['choice']??''));
        $status=$snapshot['code'];$message=$snapshot['message'];$settings=motor_arcade_settings();
        if(!$ajax&&$status===200){header('Location: '.$id.'.php#arcade',true,303);exit;}
    }else $snapshot=motor_arcade_snapshot($log);
}catch(Throwable $e){$status=$e instanceof InvalidArgumentException?400:503;$error=$status===400?$e->getMessage():'Не удалось загрузить или сохранить игру. Обновите страницу перед следующей попыткой.';}
if($ajax){
    while(ob_get_level()>0)ob_end_clean();header_remove('Content-Encoding');header('Content-Type: application/json; charset=utf-8');
    if(!$logged){$status=401;$error='Войдите на сайт, чтобы играть.';}
    http_response_code($status);echo json_encode(['html'=>$snapshot!==null&&$settings!==null?motor_arcade_view($id,$snapshot,$settings,$message,$fresh):null,'error'=>$error],JSON_UNESCAPED_UNICODE|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT);exit;
}
http_response_code($status);include '../themes/'.$config['themes'].'/index.php';
?>
<link rel="stylesheet" href="../assets/lesika/game21.css?v=arcade1"><link rel="stylesheet" href="../assets/lesika/arcade.css?v=arcade1">
<section class="g21 arcade" id="arcade" data-game="<?=$id?>" aria-labelledby="arcade-title">
<header class="g21-header"><div><span class="g21-kicker">ИГРОВОЙ КЛУБ</span><h1 id="arcade-title"><?=motor_arcade_names()[$id]?><span aria-hidden="true">.</span></h1></div><span class="g21-emblem" aria-hidden="true"><?=$id==='bandit'?'7':($id==='kosti'?'6':'3')?></span></header>
<p class="g21-intro"><?=$id==='bandit'?'Соберите линию удачи.':($id==='kosti'?'Бросок решает всё.':'Доверьтесь своей интуиции.')?></p>
<p class="g21-network" data-arcade-network role="status" aria-live="polite" hidden></p>
<?php if(!$logged)show_login('Чтобы играть, необходимо');elseif($error!=='')echo '<p class="g21-notice" role="alert">'.motor_arcade_escape($error).'</p><a href="'.$id.'.php">Обновить игру</a>';else echo motor_arcade_view($id,$snapshot,$settings,$message,$fresh);?>
<details class="g21-rules"<?=($_GET['action']??'')==='faq'?' open':''?>><summary>Правила игры <span aria-hidden="true">+</span></summary>
<?php if($id==='bandit'):?><p>В поле 3 × 3 выигрывают три одинаковых символа по горизонтали, вертикали и диагонали. Учитываются все восемь линий, выплаты складываются. Таблица выше показывает зачисление при текущей стоимости игры.</p>
<?php elseif($id==='kosti'):?><p>У вас и банкира по две шестигранные кости. Большая сумма побеждает. При победе чистый выигрыш равен двум стоимостям игры, при равенстве баланс не меняется, при поражении теряется одна стоимость.</p>
<?php else:?><p>Выберите один из трёх напёрстков. Если шарик оказался под ним, чистый выигрыш равен двум стоимостям игры; иначе теряется одна стоимость. Каждый выбор — новая независимая партия.</p><?php endif;?>
<p>В случайном режиме используются независимые случайные значения. В режиме заданного процента сначала выбирается исход с указанной вероятностью, затем формируется соответствующая комбинация. Процент означает шанс выигрыша отдельной партии, а не точную долю побед в короткой серии. Ничья и возврат стоимости выигрышем не считаются.</p>
<p>Результат рассчитывается на сервере и сохраняется. Обновление страницы и повторная отправка одного действия не запускают новую платную игру. Счётчики ведутся с обновления.</p></details>
<?php if($logged&&is_admin([101])):?><a class="g21-admin" href="../mpanel/arcade-settings.php">Настройки игр и вероятности</a><?php endif;?>
</section><script src="../assets/lesika/arcade.js?v=arcade1" defer></script><p><a href="../pages/index.php?action=arkada">← Другие игры</a></p>
<?php include '../themes/'.$config['themes'].'/foot.php'; ?>
