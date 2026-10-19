<?php
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';
if (!is_admin([101])) motor_request_reject(403,'Настройки баллов доступны только главному администратору.');
header('Cache-Control: private, no-store');$error='';$saved=false;$settings=null;
try {
    $method=$_SERVER['REQUEST_METHOD']??'GET';
    if (!in_array($method,['GET','HEAD','POST'],true)) throw new RuntimeException('Метод запроса не поддерживается.',405);
    if ($method==='POST') {motor_form_guard([]);$settings=motor_points_save($_POST);$saved=true;} else $settings=motor_points_settings();
} catch(Throwable $e) {http_response_code($e instanceof InvalidArgumentException?400:(in_array($e->getCode(),[403,405,409],true)?$e->getCode():503));$error=$e->getMessage();try{$settings=motor_points_settings();}catch(Throwable $ignored){}}
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Баллы: доступ к действиям');
$h=fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
if ($error!=='') echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if ($saved) echo '<p class="theme-success" role="status">Настройки сохранены. Новые пороги действуют во всех связанных разделах.</p>';
echo '<p>Минимум баллов активности для каждого действия. Баллы за доступ не списываются. Значение 0 разрешает действие любому вошедшему пользователю при выполнении остальных правил сайта.</p>';
if ($settings!==null) {
    echo '<form method="post">';motor_form_token();echo '<input type="hidden" name="version" value="'.motor_points_version($settings).'">';
    foreach(motor_points_labels() as $key=>$label) {
        if ($key==='flood_newbie') echo '<h2>Антифлуд</h2><p>Пороги должны возрастать. Между первым и вторым действует обычная пауза сайта. Администрация сохраняет прежнее исключение.</p>';
        echo '<label for="points-'.$key.'">'.$h($label).'</label><input id="points-'.$key.'" type="number" style="min-height:44px" inputmode="numeric" name="'.$key.'" min="0" max="1000000" step="1" required value="'.$settings[$key].'">';
    }
    echo '<p>Порог авторитета относится только к голосующему. Получать оценки по-прежнему можно с первого дня. Погашение кредита доступно независимо от баллов.</p><button class="primary" type="submit">Сохранить настройки</button></form>';
}
echo '<p><a href="setting.php?action=seteleven">Стоимость, цены и суммы кредитов</a></p><p><a href="index.php">Панель управления</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
