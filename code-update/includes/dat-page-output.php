<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}
require_once __DIR__.'/dat-pages.php';
$motorDatLevel=ob_get_level();
try {
    $motorDatState=motor_dat_state($motorDatFile);
    ob_start();include $motorDatState['path'];$motorDatHtml=ob_get_clean();
    echo $motorDatHtml;
} catch(Throwable $e) {
    while(ob_get_level()>$motorDatLevel)ob_end_clean();
    http_response_code($e->getCode()===404?404:503);
    echo '<p class="notice-error">Содержимое страницы временно недоступно.</p>';
    if(motor_home_template_owner())echo '<p><a href="'.ADMINDIR.'files.php?action=edit&amp;file='.motor_dat_escape($motorDatFile).'">Открыть редактор страницы</a></p>';
}
