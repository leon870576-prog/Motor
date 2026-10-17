<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/board.php';
if(!is_admin([101,102])){http_response_code(403);exit('Настройки доступны только администраторам.');}
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Фотографии объявлений');
try {
    motor_media_request_guard();
    if($_SERVER['REQUEST_METHOD']==='POST') {
        motor_form_guard([]);motor_media_lock();motor_media_check_version(json_encode(motor_board_settings()));
        $settings=motor_board_settings_validate($_POST);
        motor_media_atomic(DATADIR.'board-settings.json',json_encode($settings,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        echo '<p class="theme-success" role="status">Настройки фотографий сохранены.</p>';
    }
    $s=motor_board_settings();echo '<p>До пяти фотографий на одно объявление. Нулевой лимит отключает новые загрузки. Уменьшение лимитов сохраняет уже загруженные фото; их можно удалить в редакторе объявления.</p><form method="post">';motor_form_token();motor_media_version(json_encode($s));
    foreach(['count'=>['Количество фото на объявление',0,5],'photo_mb'=>['Максимальный размер одного фото, МБ',1,motor_media_cap()],'image_px'=>['Максимальная сторона оригинала, px',320,12000],'preview_px'=>['Размер предпросмотра, px',240,1200]] as $key=>[$label,$min,$max])echo '<label>'.$label.'<input type="number" name="'.$key.'" required min="'.$min.'" max="'.$max.'" step="1" value="'.$s[$key].'"></label>';
    echo '<fieldset><legend>Разрешённые форматы</legend>';foreach(['jpg','jpeg','png','gif','webp'] as $ext)echo '<label><input type="checkbox" name="formats[]" value="'.$ext.'"'.(in_array($ext,$s['formats'],true)?' checked':'').'> '.strtoupper($ext).'</label>';echo '</fieldset>';
    echo '<p>Предпросмотр создаётся в JPEG для экономии трафика; оригинал доступен по нажатию. Общая отправка — до '.motor_media_escape(ini_get('post_max_size')).'. Фото также проверяется по содержимому, числу пикселей и доступной памяти сервера.</p><button type="submit" class="primary">Сохранить настройки фото</button></form>';
} catch(Throwable $e){motor_board_error($e);}
echo '<p><a href="board.php">Управление объявлениями</a> · <a href="index.php">В админку</a></p>';include '../themes/'.$config['themes'].'/foot.php';
