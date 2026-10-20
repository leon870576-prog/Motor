<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }
require_once __DIR__.'/catalog.php';
$config['themes'] = lesika_theme_id($config['themes']);
$lesikaTheme = lesika_themes()[$config['themes']];
$lesikaHome = ($php_self === 'index.php' && empty($_GET['p']));
$lesikaAccount = !empty($log) ? 'pages/index.php?action=menu' : 'pages/login.php';
$lesikaAccountLabel = !empty($log) ? 'Моё меню' : 'Вход';
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
echo '<title>%TITLE%</title><meta name="keywords" content="%KEYWORDS%"><meta name="description" content="%DESCRIPTION%">';
echo '<meta name="theme-color" content="'.lesika_escape($lesikaTheme['colors']['--surface']).'">';
echo '<link rel="icon" href="'.BASEDIR.'assets/lesika/lesozavodsk.svg" type="image/svg+xml">';
echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/palettes.css?v=touch1"><link rel="stylesheet" href="'.BASEDIR.'assets/lesika/site.css?v=captcha1">';
echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/responsive.css?v=scroll1">';
echo '<script src="'.BASEDIR.'assets/lesika/touch.js?v=scroll1" defer></script>';
echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/gallery.css?v=gallery1"><script src="'.BASEDIR.'assets/lesika/gallery.js?v=gallery1" defer></script>';
echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/compact.css?v=compact2">';
echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/branding.css?v=city1">';
if ($lesikaHome || $php_self==='mpanel/home-settings.php') echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/home.css?v=home4">';
if ($php_self==='pages/userpage.php') echo '<link rel="stylesheet" href="'.BASEDIR.'assets/lesika/userpages.css?v=userpages1">';
echo '<link rel="alternate" type="application/rss+xml" title="Новости Лесозаводска" href="'.BASEDIR.'news/rss.php">';
echo '</head><body data-theme="'.$config['themes'].'"><div class="site-shell">';
echo '<a class="skip-link" href="#main-content">К содержимому</a><header class="site-header" id="up">';
echo '<a class="brand" href="'.BASEDIR.'index.php" aria-label="Лесозаводск — на главную"><img src="'.BASEDIR.'assets/lesika/lesozavodsk.svg" alt="Герб Лесозаводска" width="59" height="70"><span>Лесозаводск<small>Приморский край · Россия</small></span></a>';
echo '<div class="header-actions"><a class="icon-button" href="'.BASEDIR.$lesikaAccount.'" aria-label="'.$lesikaAccountLabel.'">'.lesika_icon('user').'</a>';
echo '<details class="site-menu"><summary class="icon-button" aria-label="Меню">'.lesika_icon('menu').'</summary><nav class="menu-panel" aria-label="Все разделы">';
foreach (['index.php'=>'Главная', 'news/index.php'=>'Новости', 'forum/index.php'=>'Форум', 'book/index.php'=>'Гостевая', 'chat/index.php'=>'Мини-чат', 'gallery/index.php'=>'Фотогалерея', 'board/index.php'=>'Объявления', 'pages/userlist.php'=>'Жители', 'pages/themes.php'=>'Оформление'] as $href => $title) {
    echo '<a href="'.BASEDIR.$href.'">'.$title.lesika_icon('arrow').'</a>';
}
if (!empty($log)) echo '<a href="'.BASEDIR.'pages/userpage.php">Моя страница'.lesika_icon('user').'</a>';
if (is_admin(array(101,102,103,105))) echo '<a href="'.ADMINDIR.'index.php">Админ-панель'.lesika_icon('arrow').'</a>';
echo '</nav></details></div></header>';
lesika_desktop_navigation($php_self);
echo '<main id="main-content" tabindex="-1" class="'.($lesikaHome ? 'home-content' : 'page-content').'">';
if ($lesikaHome) {
    echo '<div class="welcome">'.lesika_icon('home').'<div><strong>Городской портал Лесозаводска</strong><span>Новости и общение жителей. Приморский край, Россия.</span></div>'.lesika_icon('guest').'</div>';
} else {
    echo '<div class="page-topline"><a href="'.BASEDIR.'index.php">← На главную</a><a href="'.BASEDIR.'pages/themes.php">'.lesika_escape($lesikaTheme['name']).'</a></div>';
}
echo '<div class="legacy-content">';
if ($config['rekhead']==1) include DATADIR.'datamain/reklama_head.dat';
include BASEDIR.'includes/isset.php';
