<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/reputation.php';
include '../themes/'.$config['themes'].'/index.php';
show_title('partners.gif','Изменение авторитета');
$owner=$_GET['uz']??'';
try {
    if (!in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD','POST'],true)) throw new RuntimeException('Метод запроса не поддерживается.',405);
    if (!motor_reputation_login($owner)) throw new RuntimeException('Пользователь не найден.',404);
    if (!is_user()) throw new RuntimeException('Войдите на сайт, чтобы голосовать.',403);
    if (($_SERVER['REQUEST_METHOD']??'')==='POST') {
        motor_form_guard([]);
        $vote=$_POST['vote']??$_GET['action']??'';
        motor_reputation_vote($log,$owner,$vote,SITETIME,md5(md5($_SESSION['par'])));
        try {motor_reputation_notify($log,$owner,$vote,SITETIME);} catch (Throwable $ignored) {error_log('Reputation notification could not be delivered.');}
        header('Location: userpage.php?uz='.rawurlencode($owner).'&voted=1',true,303);exit;
    }
    echo '<p>Выберите, как изменить авторитет пользователя.</p>';motor_reputation_form($owner);
} catch (Throwable $e) {
    $status=$e->getCode();http_response_code($status>=400 && $status<=599?$status:500);
    echo '<p role="alert">'.htmlspecialchars($e instanceof RuntimeException?$e->getMessage():'Не удалось обработать голос. Повторите позже.',ENT_QUOTES,'UTF-8').'</p>';
}
if (motor_reputation_login($owner)) echo '<p><a class="touch-link" href="userpage.php?uz='.rawurlencode($owner).'">Вернуться на личную страницу</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
