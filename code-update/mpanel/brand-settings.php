<?php
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';
if (!motor_brand_owner()) motor_request_reject(403,'Настройки заглавия и логотипа доступны только владельцу сайта.');
header('Cache-Control: private, no-store');$error='';$values=motor_brand_values($config);$version=motor_brand_version($con_data);
try {
    $method=$_SERVER['REQUEST_METHOD']??'GET';
    if (!in_array($method,['GET','HEAD','POST'],true)) throw new RuntimeException('Метод запроса не поддерживается.',405);
    if ($method==='POST') {motor_brand_save($_POST);header('Location: brand-settings.php?saved=1',true,303);exit;}
} catch(Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException?400:(in_array($e->getCode(),[403,405,409],true)?$e->getCode():503));
    $error=$e instanceof InvalidArgumentException||$e instanceof RuntimeException?$e->getMessage():'Не удалось сохранить настройки.';
    foreach (['title','subtitle','logo'] as $key) if(isset($_POST[$key])&&is_string($_POST[$key])&&strlen($_POST[$key])<=2048)$values[$key]=$_POST[$key];
    if(isset($_POST['version'])&&is_string($_POST['version'])&&preg_match('/^[a-f0-9]{64}$/D',$_POST['version']))$version=$_POST['version'];
}
include '../themes/'.$config['themes'].'/index.php';show_title('menu.gif','Заглавие и логотип сайта');$h='motor_brand_escape';
echo '<section class="brand-settings">';
if($error!=='')echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if($error===''&&($_GET['saved']??'')==='1')echo '<p class="theme-success" role="status">Сохранено. Заглавие и логотип обновлены во всех темах сайта.</p>';
echo '<p>Название отображается рядом с логотипом и в заголовках страниц. Настройки общие для всех тем и разделов.</p>';
echo '<form method="post" action="brand-settings.php">';motor_form_token();
echo '<input type="hidden" name="version" value="'.$version.'">';
echo '<label>Заглавие сайта<input name="title" required maxlength="100" value="'.$h($values['title']).'"></label>';
echo '<label>Подпись под названием<input name="subtitle" maxlength="100" value="'.$h($values['subtitle']).'"></label>';
echo '<label>Картинка логотипа<input name="logo" maxlength="2048" value="'.$h($values['logo']).'" aria-describedby="brand-logo-help"></label>';
echo '<p id="brand-logo-help">Укажите путь к загруженной на хостинг картинке, например images/logo.png, или полный HTTPS-адрес. Пустое поле возвращает герб Лесозаводска. Поддерживаются PNG, JPG, GIF, WebP и SVG. Эта же картинка используется как значок сайта.</p>';
echo '<button class="primary" type="submit">Сохранить заглавие и логотип</button></form>';
$current=motor_brand_values($config);
echo '<h2>Текущий логотип</h2><div class="brand-preview"><img src="'.$h($current['src']).'" alt="'.$h('Логотип '.$current['title']).'"><div><strong>'.$h($current['title']).'</strong><small>'.$h($current['subtitle']).'</small></div></div>';
echo '<p><a href="../index.php">Посмотреть на сайте</a> · <a href="index.php">В админку</a> · <a href="setting.php?action=setone">Основные настройки</a></p></section>';
include '../themes/'.$config['themes'].'/foot.php';
