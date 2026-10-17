<?php
// Attachments live outside public URLs. Original Motor records remain readable.
if (!defined('DATADIR')) { http_response_code(403); exit; }

function motor_media_escape($value) { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function motor_media_types() {
    return [
        'jpg'=>['photo','image/jpeg'], 'jpeg'=>['photo','image/jpeg'],
        'png'=>['photo','image/png'], 'gif'=>['photo','image/gif'], 'webp'=>['photo','image/webp'],
        'mp4'=>['video','video/mp4'], 'webm'=>['video','video/webm'],
        'pdf'=>['file','application/pdf'], 'txt'=>['file','text/plain'], 'csv'=>['file','text/csv'],
        'zip'=>['file','application/zip'],
        'docx'=>['file','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'xlsx'=>['file','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        'pptx'=>['file','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        'odt'=>['file','application/vnd.oasis.opendocument.text'],
        'ods'=>['file','application/vnd.oasis.opendocument.spreadsheet']
    ];
}
function motor_media_defaults() {
    $s = ['count'=>5, 'photo_mb'=>8, 'video_mb'=>24, 'file_mb'=>8, 'image_px'=>8000, 'preview_px'=>640,
        'formats'=>array_keys(motor_media_types())];
    return ['forum'=>$s, 'news'=>$s];
}
function motor_media_settings() {
    $settings = motor_media_defaults();
    $path = DATADIR.'attachment-settings.json';
    if (is_file($path)) {
        $stored = json_decode(file_get_contents($path), true);
        if (is_array($stored)) {
            foreach ($settings as $section=>$defaults) {
                if (isset($stored[$section]) && is_array($stored[$section])) $settings[$section] = array_merge($defaults, $stored[$section]);
            }
        }
    }
    require_once __DIR__.'/board-settings.php';
    $settings['board'] = motor_board_settings();
    return $settings;
}
function motor_media_ini_bytes($value) {
    $value = trim((string)$value);
    $unit = strtolower(substr($value, -1));
    return (int)((float)$value * (['g'=>1073741824,'m'=>1048576,'k'=>1024][$unit] ?? 1));
}
function motor_media_cap() { return min(32, max(1, (int)floor(motor_media_ini_bytes(ini_get('upload_max_filesize')) / 1048576))); }
function motor_media_uuid() { return bin2hex(random_bytes(16)); }
function motor_media_valid_parent($section, $parent) {
    if (!is_string($section) || (!is_string($parent) && !is_int($parent))) return false;
    return ($section === 'news' && preg_match('/^[0-9]{1,18}$/D', (string)$parent)) ||
        (in_array($section, ['forum','board'], true) && preg_match('/^[a-f0-9]{32}$/D', (string)$parent));
}
function motor_media_dir($section, $parent) {
    if (!motor_media_valid_parent($section, $parent)) throw new RuntimeException('Неверная запись для вложений.');
    return DATADIR.'attachments/'.$section.'/'.$parent;
}
function motor_media_manifest($section, $parent) {
    if (!motor_media_valid_parent($section, $parent)) return ['files'=>[]];
    $path = motor_media_dir($section, $parent).'/manifest.json';
    if (!is_file($path)) return ['files'=>[]];
    $data = json_decode(file_get_contents($path), true);
    if (!is_array($data) || !isset($data['files']) || !is_array($data['files'])) throw new RuntimeException('Не удалось прочитать список вложений.');
    return $data;
}
function motor_media_lock() {
    static $lock;
    if ($lock) return;
    $lock = fopen(DATADIR.'.attachments.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Не удалось заблокировать данные для записи.');
}
function motor_media_atomic($path, $contents) {
    $tmp = $path.'.'.motor_media_uuid().'.tmp';
    if (file_put_contents($tmp, $contents) !== strlen($contents)) { @unlink($tmp); throw new RuntimeException('Недостаточно места для сохранения.'); }
    @chmod($tmp, 0600);
    if (!rename($tmp, $path)) { @unlink($tmp); throw new RuntimeException('Не удалось сохранить изменения.'); }
}
function motor_media_csrf() {
    $token = $_POST['uid'] ?? $_GET['uid'] ?? '';
    return ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && is_string($token) &&
        !empty($_SESSION['token']) && hash_equals($_SESSION['token'], $token);
}
function motor_media_version($record) {
    echo '<input type="hidden" name="record_version" value="'.hash('sha256', $record).'" />';
}
function motor_media_check_version($record) {
    $version = $_POST['record_version'] ?? '';
    if (!is_string($version) || !hash_equals(hash('sha256', $record), $version)) motor_media_stop('Запись изменилась или была удалена. Откройте форму заново, чтобы не затереть чужие изменения.', 409);
}
function motor_media_stop($message, $status=400) {
    http_response_code($status);
    show_error(motor_media_escape($message));
    if (isset($_POST['msg']) && is_string($_POST['msg'])) {
        echo '<p>Запись не сохранена. Ваш текст можно скопировать ниже. После возврата выберите файлы ещё раз.</p><textarea readonly rows="8">'.motor_media_escape($_POST['msg']).'</textarea>';
    }
    echo '<p><button type="button" onclick="history.back()">Вернуться к форме</button></p>';
    global $config, $ip, $log, $brow, $starttime, $php_self, $udata, $request_uri, $http_referer, $ip_addr, $support_gzip, $support_deflate;
    include BASEDIR.'themes/'.$config['themes'].'/foot.php';
    exit;
}
function motor_media_request_guard() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $max = motor_media_ini_bytes(ini_get('post_max_size'));
        if ($max > 0 && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) motor_media_stop('Общий размер отправки превышает лимит сервера: '.ini_get('post_max_size').'. Отправьте меньше файлов.', 413);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' || in_array($_GET['act'] ?? '', ['delforum','deltopic'], true)) motor_media_lock();
}
function motor_media_uploads($section) {
    $settings = motor_media_settings()[$section];
    $types = motor_media_types(); $result = [];
    if (!isset($_FILES['attachments'])) return [];
    $f = $_FILES['attachments'];
    if (!is_array($f['name'] ?? null) || count($f['name']) > 10) throw new RuntimeException('За один раз можно отправить не более 10 файлов.');
    foreach ($f['name'] as $i=>$name) {
        $error = $f['error'][$i] ?? UPLOAD_ERR_NO_FILE;
        if ($error === UPLOAD_ERR_NO_FILE) continue;
        if (!is_string($name) || !is_int($error)) throw new RuntimeException('Некорректная загрузка файла.');
        if ($error !== UPLOAD_ERR_OK) throw new RuntimeException('Файл не загружен полностью или превышает лимит сервера. Выберите его повторно.');
        $tmp = $f['tmp_name'][$i] ?? '';
        if (!is_string($tmp) || !is_uploaded_file($tmp)) throw new RuntimeException('Некорректный источник файла.');
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[\x00-\x1f\x7f]/u', '', $name);
        if (!$name || mb_strlen($name) > 180) throw new RuntimeException('Слишком длинное или некорректное имя файла.');
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset($types[$ext]) || !in_array($ext, $settings['formats'], true)) throw new RuntimeException('Формат «'.$ext.'» запрещён в этом разделе.');
        [$kind, $mime] = $types[$ext];
        $size = filesize($tmp);
        if ($size < 1 || $size > min($settings[$kind.'_mb'], motor_media_cap()) * 1048576) throw new RuntimeException('Файл «'.$name.'» пустой или превышает допустимый размер.');
        $detected = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
        if ($kind === 'photo') {
            $image = @getimagesize($tmp);
            if (!$image || ($image['mime'] ?? '') !== $mime || $detected !== $mime) throw new RuntimeException('Содержимое файла не соответствует формату изображения.');
            if ($image[0] < 1 || $image[1] < 1 || $image[0] > $settings['image_px'] || $image[1] > $settings['image_px'] || $image[0] * $image[1] > 40000000) throw new RuntimeException('Изображение слишком большое по количеству пикселей.');
            $budget = motor_media_ini_bytes(ini_get('memory_limit'));
            $need = memory_get_usage(true) + $image[0]*$image[1]*8 + 24*1048576;
            if ($budget > 0 && $need > $budget*.9) throw new RuntimeException('Недостаточно памяти для проверки фото. Уменьшите его разрешение.');
            $loader = ['image/jpeg'=>'imagecreatefromjpeg','image/png'=>'imagecreatefrompng','image/gif'=>'imagecreatefromgif','image/webp'=>'imagecreatefromwebp'][$mime];
            $decoded = function_exists($loader) ? @$loader($tmp) : false;
            if (!$decoded) throw new RuntimeException('Изображение повреждено или не может быть прочитано.');
            imagedestroy($decoded);
        } elseif ($kind === 'video') {
            if ($detected !== $mime) throw new RuntimeException('Содержимое файла не соответствует формату видео.');
        } elseif (in_array($ext, ['txt','csv'], true)) {
            if (!in_array($detected, ['text/plain','text/csv','application/csv'], true)) throw new RuntimeException('Ожидается текстовый файл.');
        } elseif (in_array($ext, ['zip','docx','xlsx','pptx','odt','ods'], true)) {
            $zip = new ZipArchive();
            if ($zip->open($tmp, ZipArchive::CHECKCONS) !== true) throw new RuntimeException('Повреждён архив или документ.');
            $required = ['docx'=>'word/document.xml','xlsx'=>'xl/workbook.xml','pptx'=>'ppt/presentation.xml','odt'=>'content.xml','ods'=>'content.xml'];
            $valid = !isset($required[$ext]) || $zip->locateName($required[$ext]) !== false;
            if (in_array($ext, ['odt','ods'], true)) $valid = $valid && $zip->getFromName('mimetype', 128) === $mime;
            $zip->close();
            if (!$valid) throw new RuntimeException('Содержимое документа не соответствует расширению.');
        } elseif ($detected !== $mime) throw new RuntimeException('Содержимое файла не соответствует формату.');
        $result[] = ['id'=>motor_media_uuid(), 'name'=>$name, 'ext'=>$ext, 'kind'=>$kind, 'mime'=>$mime, 'size'=>$size, 'tmp'=>$tmp];
    }
    return $result;
}

// Save the record and its manifest together; keep old files until both writes succeed.
function motor_media_save_record($section, $parent, $context, $path, $line, $text) {
    try {
        if (!motor_media_csrf()) motor_media_stop('Неверный идентификатор сессии. Обновите форму.', 403);
        motor_media_lock();
        $old = motor_media_manifest($section, $parent); $kept = []; $removed = [];
        $remove = $_POST['remove_attachments'] ?? [];
        if (!is_array($remove) || count($remove)>10 || count(array_filter($remove,fn($id)=>is_string($id) && preg_match('/^[a-f0-9]{32}$/D',$id)))!==count($remove)) throw new RuntimeException('Неверный список удаляемых файлов.');
        foreach ($old['files'] as $file) {
            if (in_array($file['id'], $remove, true)) $removed[] = $file; else $kept[] = $file;
        }
        $incoming = motor_media_uploads($section);
        $limit = (int)motor_media_settings()[$section]['count'];
        // Lowering limits does not destroy existing attachments; additions obey the new limit.
        if ($incoming && count($kept) + count($incoming) > $limit) throw new RuntimeException('В этом разделе разрешено вложений на запись: '.$limit.'. Удалите лишние файлы.');
        $dir = motor_media_dir($section, $parent); $moved = [];
        if (($incoming || $old['files']) && !is_dir($dir) && !mkdir($dir, 0700, true)) throw new RuntimeException('Не удалось создать папку вложений.');
        $bytes = array_sum(array_column($incoming, 'size'));
        if ($bytes && disk_free_space(DATADIR) < $bytes + 8388608) throw new RuntimeException('На сервере недостаточно свободного места.');
        $before = is_file($path) ? file_get_contents($path) : null;
        $lines = $before === null ? [] : file($path);
        if ($line !== null && !isset($lines[$line])) throw new RuntimeException('Запись уже удалена. Обновите страницу.');
        if ($line === null) $lines[] = rtrim($text, "\r\n")."\r\n"; else $lines[$line] = rtrim($text, "\r\n")."\r\n";
        try {
            foreach ($incoming as $file) {
                $target = $dir.'/'.$file['id'].'.blob';
                if (!move_uploaded_file($file['tmp'], $target)) throw new RuntimeException('Не удалось сохранить файл.');
                $moved[] = $target; chmod($target, 0600); unset($file['tmp']); $kept[] = $file;
            }
            motor_media_atomic($path, implode('', $lines));
            if ($kept || $old['files']) motor_media_atomic($dir.'/manifest.json', json_encode(['context'=>$context, 'files'=>$kept], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        } catch (Throwable $e) {
            foreach ($moved as $target) @unlink($target);
            if ($before !== null) motor_media_atomic($path, $before); elseif (is_file($path)) unlink($path);
            throw $e;
        }
        foreach ($removed as $file) { foreach (glob($dir.'/'.$file['id'].'.*') as $target) if (is_file($target) || is_link($target)) unlink($target); }
    } catch (Throwable $e) { motor_media_stop($e->getMessage()); }
}
function motor_media_delete($section, $parent) {
    if (!motor_media_valid_parent($section, $parent)) return;
    $dir = motor_media_dir($section, $parent);
    if (!is_dir($dir)) return;
    foreach (glob($dir.'/*') as $path) if (is_file($path)) unlink($path);
    rmdir($dir);
}
function motor_media_delete_posts($path, $selected=null) {
    if (!is_file($path)) return;
    foreach (file($path) as $i=>$line) if ($selected === null || in_array($i, (array)$selected)) {
        $data = explode('|', $line); motor_media_delete('forum', trim($data[6] ?? ''));
    }
}
function motor_media_url($section, $parent, $file, $download=false) {
    return BASEDIR.'attachment.php?section='.$section.'&amp;parent='.$parent.'&amp;file='.$file.($download ? '&amp;download=1' : '');
}
// Read existing originals without rewriting manifests or user files.
function motor_media_image_size($section, $parent, $id) {
    static $sizes = [];
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || !motor_media_valid_parent($section, $parent)) return [4, 3];
    $path = motor_media_dir($section, $parent).'/'.$id.'.blob';
    if (isset($sizes[$path])) return $sizes[$path];
    $image = is_file($path) && !is_link($path) ? @getimagesize($path) : false;
    if (!$image || $image[0] < 1 || $image[1] < 1 || $image[0] > 12000 || $image[1] > 12000) return $sizes[$path] = [4, 3];
    $width = (int)$image[0]; $height = (int)$image[1];
    // Browsers rotate JPEGs using EXIF; reserve the same displayed aspect ratio.
    if ($image[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $exif = @exif_read_data($path, 'IFD0');
        if (in_array((int)($exif['Orientation'] ?? 1), [5,6,7,8], true)) [$width, $height] = [$height, $width];
    }
    return $sizes[$path] = [$width, $height];
}
function motor_media_render($section, $parent, $limit=0) {
    $files = motor_media_manifest($section, $parent)['files'];
    if (!$files) return;
    if ($limit) $files = array_slice($files, 0, $limit);
    $width = (int)motor_media_settings()[$section]['preview_px'];
    echo '<div class="attachments" style="--attachment-width:'.$width.'px">';
    foreach ($files as $f) {
        $url = motor_media_url($section, $parent, $f['id']); $name = motor_media_escape($f['name']);
        echo '<figure class="attachment">';
        if ($f['kind'] === 'photo') {
            [$imageWidth, $imageHeight] = motor_media_image_size($section, $parent, $f['id']);
            echo '<a href="'.$url.'" target="_blank" rel="noopener"><img src="'.$url.($section==='board'?'&amp;preview=1':'').'" width="'.$imageWidth.'" height="'.$imageHeight.'" alt="'.$name.'" loading="lazy" decoding="async" /></a>';
        }
        if ($f['kind'] === 'video') echo '<video controls playsinline preload="none" width="1600" height="900" src="'.$url.'">Ваш браузер не поддерживает это видео.</video>';
        echo '<figcaption><a href="'.motor_media_url($section, $parent, $f['id'], true).'">Скачать: '.$name.'</a> <small>('.round($f['size']/1024, 1).' КБ)</small></figcaption></figure>';
    }
    echo '</div>';
}
function motor_media_form($section, $parent='') {
    $s = motor_media_settings()[$section];
    echo '<fieldset class="attachment-picker"><legend>'.($section==='board'?'Фотографии объявления':'Фото, видео и файлы').'</legend>';
    foreach (motor_media_manifest($section, $parent)['files'] as $file) {
        echo '<label class="attachment-remove"><input type="checkbox" name="remove_attachments[]" value="'.$file['id'].'" /> Удалить: '.motor_media_escape($file['name']).'</label>';
    }
    if ($section==='board') echo '<p>До '.$s['count'].' фотографий на объявление, до '.$s['photo_mb'].' МБ каждая и '.$s['image_px'].' px по стороне.</p>';
    else echo '<p>До '.$s['count'].' вложений на запись. Фото — '.$s['photo_mb'].' МБ, видео — '.$s['video_mb'].' МБ, файлы — '.$s['file_mb'].' МБ каждое. Фото до '.$s['image_px'].' px по стороне.</p>';
    if ($s['count'] > 0 && $s['formats']) {
        echo '<label>Выбрать вложения<input type="file" name="attachments[]" multiple accept=".'.implode(',.', $s['formats']).'" /></label>';
        echo '<small>Форматы: '.motor_media_escape(strtoupper(implode(', ', $s['formats']))).'. Общая отправка — до '.motor_media_escape(ini_get('post_max_size')).'.'.($section==='board'?'':' Для видео рекомендуется MP4 (H.264/AAC).').'</small>';
    } else echo '<p>Добавление новых вложений отключено администратором.</p>';
    echo '</fieldset>';
}
