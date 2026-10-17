<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/gallery.php';
if (!motor_gallery_admin()) {http_response_code(403);exit('Настройки доступны только администраторам.');}
include '../themes/'.$config['themes'].'/index.php';
show_title('gallery.gif','Настройки галереи');
try {
    motor_gallery_request_guard();
    if ($_SERVER['REQUEST_METHOD']==='POST') {
        motor_form_guard([]);motor_gallery_lock();
        motor_gallery_check_version(json_encode(motor_gallery_settings()));
        $settings=motor_gallery_validate_settings($_POST);
        motor_media_atomic(DATADIR.'gallery-settings.json',json_encode($settings,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        motor_gallery_audit('settings',[]);
        echo '<p class="theme-success" role="status">Настройки сохранены и применены к галерее.</p>';
    }
} catch (Throwable $e) {motor_gallery_error($e);}
try {
    $settings=motor_gallery_settings();
    echo '<p>Оригинал сохраняется без изменения качества. Ограничения файла применяются к новым загрузкам. Размер предпросмотра и увеличение — ко всем фотографиям.</p><p>Лимит сервера: '.motor_media_cap().' МБ на файл, '.motor_gallery_escape(ini_get('post_max_size')).' на отправку. Одновременно загружается одна фотография.</p>';
    echo '<form method="post">';motor_form_token();motor_gallery_version(json_encode($settings));
    foreach (['max_mb'=>['Максимальный вес фото, МБ',1,motor_media_cap()],'max_side'=>['Максимальная сторона фото, px',1000,12000],'max_mp'=>['Максимальное разрешение, Мп',1,24],'preview_px'=>['Размер предпросмотра, px',320,1600],'quality'=>['Качество предпросмотра JPEG, %',60,92],'per_page'=>['Фотографий на странице',3,24],'comments_page'=>['Комментариев на странице',3,50],'comments_max'=>['Комментариев сохранять на фото',50,5000]] as $key=>$field) {
        echo '<label>'.$field[0].'<input type="number" required name="'.$key.'" min="'.$field[1].'" max="'.$field[2].'" step="1" value="'.$settings[$key].'"></label>';
    }
    echo '<fieldset><legend>Разрешённые форматы</legend>';
    foreach (['jpg','jpeg','png','gif','webp'] as $ext) echo '<label><input type="checkbox" name="formats[]" value="'.$ext.'"'.(in_array($ext,$settings['formats'],true)?' checked':'').'> '.strtoupper($ext).'</label>';
    echo '</fieldset>';
    foreach (['zoom'=>'Увеличение фото пальцами и кнопками','watermark'=>'Подпись сайта на предпросмотре (оригинал без изменений)'] as $key=>$label) {
        echo '<label>'.$label.'<select name="'.$key.'"><option value="1"'.($settings[$key]?' selected':'').'>Включено</option><option value="0"'.(!$settings[$key]?' selected':'').'>Выключено</option></select></label>';
    }
    echo '<label for="watermark-text">Текст водяного знака<input id="watermark-text" type="text" name="watermark_text" required maxlength="60" value="'.motor_gallery_escape($settings['watermark_text']).'" aria-describedby="watermark-help"></label>';
    echo '<p id="watermark-help">От 1 до 60 символов в одну строку, например «Лесика» или «сайт.ру». Подпись появится внизу фото, когда водяной знак включён. После сохранения она обновится и на ранее загруженных фотографиях при следующем просмотре. Скачиваемые оригиналы остаются без изменений.</p>';
    echo '<p>Фото всегда помещается в экран. Посетители могут скачать оригинал. HEIC/HEIF нужно предварительно сохранить как JPEG или PNG.</p><button type="submit" class="primary">Сохранить настройки галереи</button></form>';
} catch (Throwable $e) {motor_gallery_error($e);}
echo '<nav class="gallery-actions"><a href="gallery.php">Управление фотографиями</a><a href="attachments.php">Вложения форума и новостей</a><a href="index.php">В админку</a></nav>';
include '../themes/'.$config['themes'].'/foot.php';
