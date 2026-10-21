<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/userpages.php';
if (!is_user() || !motor_userpage_manager((string)$log)) {http_response_code(403);exit('Недостаточно прав.');}
include '../themes/'.$config['themes'].'/index.php';
echo '<div class="userpage"><h1>Личные страницы пользователей</h1>';
try {
    if (!in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD'],true)) throw new RuntimeException('Для поиска используйте форму на странице.',405);
    $query=$_GET['uz']??'';$page=$_GET['page']??'1';
    if (!is_string($query) || !preg_match('/^[a-z0-9-]{0,20}$/Di',$query) || !is_string($page) || !preg_match('/^[1-9][0-9]{0,5}$/D',$page)) throw new RuntimeException('Введите логин или его часть (до 20 символов).',400);
    echo '<form method="get" action="userpages.php" class="up-form"><label>Поиск по логину<input name="uz" maxlength="20" value="'.motor_gallery_escape($query).'"></label><button class="primary" type="submit">Найти</button></form>';
    $users=array_filter(array_keys(motor_info_profiles()),fn($name)=>motor_userpage_login($name) && ($query==='' || stripos($name,$query)!==false));
    natcasesort($users);$users=array_values($users);$total=count($users);$pages=max(1,(int)ceil($total/20));$page=min((int)$page,$pages);
    echo '<p>Найдено пользователей: '.$total.'</p>';
    foreach (array_slice($users,($page-1)*20,20) as $owner) {
        echo '<section class="up-panel"><h2>'.motor_gallery_escape($owner).'</h2><div class="up-actions"><a class="touch-link up-button" href="'.motor_gallery_escape(motor_userpage_url($owner)).'">Личная страница</a><a class="touch-link up-button" href="'.motor_gallery_escape(motor_userpage_url($owner,['tab'=>'settings'])).'">Настройки и удаление данных</a></div></section>';
    }
    if ($pages>1) {
        echo '<nav class="up-actions" aria-label="Страницы пользователей">';
        if ($page>1) echo '<a class="touch-link" href="userpages.php?uz='.rawurlencode($query).'&amp;page='.($page-1).'">← Предыдущая</a>';
        echo '<span>Страница '.$page.' из '.$pages.'</span>';
        if ($page<$pages) echo '<a class="touch-link" href="userpages.php?uz='.rawurlencode($query).'&amp;page='.($page+1).'">Следующая →</a>';
        echo '</nav>';
    }
} catch (Throwable $e) {
    $code=$e->getCode();http_response_code($code>=400 && $code<=599?$code:500);
    echo '<p role="alert">'.motor_gallery_escape($e instanceof RuntimeException?$e->getMessage():'Не удалось открыть список страниц.').'</p>';
}
echo '<p><a class="touch-link up-button" href="index.php">В админку</a></p></div>';
include '../themes/'.$config['themes'].'/foot.php';
