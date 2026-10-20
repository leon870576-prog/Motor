<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }
echo '</div></main><footer class="site-footer" id="down"><p class="community-note">Город становится теплее, когда мы вместе.</p>';
echo '<a class="theme-footer-link" href="'.BASEDIR.'pages/themes.php">'.lesika_icon('theme').'Ваш уютный стиль</a>';
$motorFooterAdRendered=true;
if ($config['rekfoot']==1) {echo '<div id="motor-ad-foot" class="dat-ad">';$motorDatFile='reklama_foot.dat';include BASEDIR.'includes/dat-page-output.php';echo '</div>';}
echo '<details class="site-stats"><summary>Навигация и статистика</summary><div>';
require BASEDIR.'includes/counters.php';
require BASEDIR.'includes/gzip_foot.php';
echo '</div></details></footer><nav class="bottom-nav" aria-label="Быстрые переходы">';
$lesikaLinks = [
    ['index.php','home','Главная'], ['news/index.php','news','Новости'],
    ['forum/index.php','forum','Форум'], ['book/index.php','guest','Гостевая'], ['pages/themes.php','theme','Темы']
];
foreach ($lesikaLinks as [$href,$icon,$title]) {
    $active = $href === 'index.php' ? $php_self === 'index.php' : ($href === 'pages/themes.php' ? str_starts_with($php_self,'pages/themes') : str_starts_with($php_self,dirname($href).'/'));
    echo '<a href="'.BASEDIR.$href.'"'.($active ? ' aria-current="page"' : '').'>'.lesika_icon($icon).'<span>'.$title.'</span></a>';
}
echo '</nav></div>';
motor_smile_picker_assets();
echo '</body></html>';
if (ob_get_level() > 0) ob_end_flush();
exit;
