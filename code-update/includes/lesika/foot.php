<?php
global $motorBottomMenu;
if (!defined('BASEDIR')) { http_response_code(403); exit; }
echo '</div></main><footer class="site-footer" id="down"><p class="community-note">Город становится теплее, когда мы вместе.</p>';
echo '<a class="theme-footer-link" href="'.BASEDIR.'pages/themes.php">'.lesika_icon('theme').'Ваш уютный стиль</a>';
$motorFooterAdRendered=true;
if ($config['rekfoot']==1) {echo '<div id="motor-ad-foot" class="dat-ad">';$motorDatFile='reklama_foot.dat';include BASEDIR.'includes/dat-page-output.php';echo '</div>';}
echo '<details class="site-stats"><summary>Навигация и статистика</summary><div>';
require BASEDIR.'includes/counters.php';
require BASEDIR.'includes/gzip_foot.php';
echo '</div></details></footer>';
motor_bottom_render($motorBottomMenu);
echo '</div>';
motor_smile_picker_assets();
echo '</body></html>';
if (ob_get_level() > 0) ob_end_flush();
exit;
