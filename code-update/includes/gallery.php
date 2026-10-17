<?php
// Gallery storage and permissions. Existing fotobase.dat records and URLs stay readable.
if (!defined('DATADIR')) { http_response_code(403); exit; }
require_once __DIR__.'/attachments.php';
function motor_gallery_moderator(): bool { return is_admin([101,102,103,105]); }
function motor_gallery_admin(): bool { return is_admin([101,102]); }
function motor_gallery_escape($s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function motor_gallery_plain(string $s): string { return html_entity_decode(str_replace(['<br />','<br>','<br/>'], "\n", nosmiles($s)), ENT_QUOTES); }
function motor_gallery_text(string $s): string { return bb_code(nl2br(motor_gallery_escape(motor_gallery_plain($s)))); }
function motor_gallery_valid_id($id): bool { return is_string($id) && (bool)preg_match('/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,100}\.(?:jpe?g|png|gif|webp)$/Di', $id) && !str_contains($id, '..'); }
function motor_gallery_lock(bool $exclusive = true): void {
    static $handle;
    if ($handle) return;
    $handle = fopen(DATADIR.'datagallery/.gallery.lock', 'c');
    if (!$handle || !flock($handle, $exclusive ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Не удалось открыть галерею для изменения.', 503);
}
function motor_gallery_rows(): array {
    $p = DATADIR.'datagallery/fotobase.dat';
    return is_file($p) ? array_values(array_filter(file($p, FILE_IGNORE_NEW_LINES), fn($v) => trim($v) !== '')) : [];
}
function motor_gallery_find($id, ?array $rows = null): ?array {
    if (!motor_gallery_valid_id($id)) return null;
    foreach ($rows ?? motor_gallery_rows() as $i => $row) {
        $d = explode('|', $row);
        if (($d[6] ?? '') === $id) return ['index'=>$i,'row'=>$row,'data'=>$d];
    }
    return null;
}
function motor_gallery_visible(?array $photo): bool { return $photo !== null && (($photo['data'][3] ?? '') !== 'hidden' || motor_gallery_moderator()); }
function motor_gallery_save(array $rows): void { motor_media_atomic(DATADIR.'datagallery/fotobase.dat', $rows ? implode("\r\n", array_values($rows))."\r\n" : ''); }
function motor_gallery_settings(): array {
    global $config;
    $defaults = ['max_mb'=>20,'max_side'=>8000,'max_mp'=>24,'preview_px'=>960,'per_page'=>max(3,min(24,(int)($config['fotolist'] ?? 6))),
        'quality'=>82,'zoom'=>1,'watermark'=>(int)!empty($config['copyfoto']),'comments_page'=>max(3,min(50,(int)($config['postgallery'] ?? 10))),
        'comments_max'=>max(50,min(5000,(int)($config['maxpostgallery'] ?? 500))),'formats'=>['jpg','jpeg','png','gif','webp']];
    $path=DATADIR.'gallery-settings.json';
    if (is_file($path)) {
        $stored=json_decode(file_get_contents($path),true);
        if (!is_array($stored)) throw new RuntimeException('Не удалось прочитать настройки галереи.',500);
        $defaults=array_merge($defaults,$stored);
    }
    $defaults['max_mb']=min((int)$defaults['max_mb'],motor_media_cap());
    return motor_gallery_validate_settings($defaults);
}
function motor_gallery_validate_settings(array $input): array {
    $out=[];
    foreach (['max_mb'=>[1,motor_media_cap()],'max_side'=>[1000,12000],'max_mp'=>[1,24],'preview_px'=>[320,1600],'per_page'=>[3,24],
        'quality'=>[60,92],'zoom'=>[0,1],'watermark'=>[0,1],'comments_page'=>[3,50],'comments_max'=>[50,5000]] as $key=>$range) {
        $v=filter_var($input[$key] ?? null,FILTER_VALIDATE_INT);
        if ($v===false || $v<$range[0] || $v>$range[1]) throw new RuntimeException('Недопустимое значение настройки «'.$key.'».',400);
        $out[$key]=$v;
    }
    $formats=$input['formats'] ?? [];
    if (!is_array($formats) || count($formats)>5 || !$formats || count(array_filter($formats,'is_string'))!==count($formats) || array_diff($formats,['jpg','jpeg','png','gif','webp'])) throw new RuntimeException('Выберите допустимые форматы фотографий.',400);
    $out['formats']=array_values(array_unique($formats));
    $text=$input['watermark_text'] ?? 'WapMotor';
    if (!is_string($text) || strlen($text)>240 || !mb_check_encoding($text,'UTF-8')) throw new RuntimeException('Текст водяного знака: от 1 до 60 символов в одну строку.',400);
    $text=trim($text);
    if ($text==='' || mb_strlen($text,'UTF-8')>60 || preg_match('/\p{C}/u',$text)) throw new RuntimeException('Текст водяного знака: от 1 до 60 символов в одну строку.',400);
    $out['watermark_text']=$text;
    return $out;
}
function motor_gallery_version(string $row): void { echo '<input type="hidden" name="record_version" value="'.hash('sha256',$row).'">'; }
function motor_gallery_check_version(string $row): void {
    $v=$_POST['record_version'] ?? '';
    if (!is_string($v) || !hash_equals(hash('sha256',$row),$v)) throw new RuntimeException('Данные изменились. Обновите страницу и повторите действие.',409);
}
function motor_gallery_audit(string $action, array $ids): void {
    global $log;
    $path=DATADIR.'datagallery/gallery-audit.jsonl';
    $rows=is_file($path)?file($path,FILE_IGNORE_NEW_LINES):[];
    $rows[]=json_encode(['time'=>time(),'actor'=>$log,'action'=>$action,'photos'=>array_values($ids)],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    // The protected journal is bounded and included with gallery backups.
    motor_media_atomic($path,implode("\n",array_slice($rows,-500))."\n");
}
function motor_gallery_input(): array {
    motor_form_guard(['name','msg']);
    $name=trim($_POST['name']);$msg=trim($_POST['msg']);
    if (mb_strlen($name)<1 || mb_strlen($name)>100 || mb_strlen($msg)>2000) throw new RuntimeException('Название: от 1 до 100 символов; подпись: до 2000 символов.',400);
    return [no_br(check($name)),no_br(antimat(check($msg)),'<br />')];
}
function motor_gallery_image_info(string $path, array $settings): array {
    $info=@getimagesize($path);
    if (!$info || !in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_GIF,IMAGETYPE_WEBP],true)) throw new RuntimeException('Файл не является поддерживаемой фотографией.',400);
    [$w,$h]=$info;
    if ($w<1 || $h<1 || max($w,$h)>$settings['max_side'] || $w*$h>$settings['max_mp']*1000000) throw new RuntimeException('Фото превышает лимит размеров: '.$settings['max_side'].' px по стороне и '.$settings['max_mp'].' Мп.',400);
    return $info;
}
function motor_gallery_watermark(GdImage $dst,string $text): void {
    $width=imagesx($dst);$height=imagesy($dst);
    // Keep the established artwork until the administrator changes its name.
    if ($text==='WapMotor') {
        $mark=@imagecreatefromgif(BASEDIR.'images/img/copyright.gif');
        if (!$mark) throw new RuntimeException('Не удалось прочитать подпись сайта.',500);
        try {imagecopy($dst,$mark,max(0,$width-imagesx($mark)),max(0,$height-imagesy($mark)),0,0,min($width,imagesx($mark)),min($height,imagesy($mark)));}
        finally {imagedestroy($mark);}
        return;
    }
    $font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!is_file($font) || !function_exists('imagettftext')) throw new RuntimeException('Недоступен шрифт водяного знака.',500);
    $size=max(10,min(18,$width/50));$box=imagettfbbox($size,0,$font,$text);
    if (!$box) throw new RuntimeException('Не удалось измерить водяной знак.',500);
    $left=min($box[0],$box[2],$box[4],$box[6]);$top=min($box[1],$box[3],$box[5],$box[7]);
    $w=max($box[0],$box[2],$box[4],$box[6])-$left+12;$h=max($box[1],$box[3],$box[5],$box[7])-$top+12;
    $mark=imagecreatetruecolor($w,$h);
    try {
        imagealphablending($mark,false);imagesavealpha($mark,true);imagefill($mark,0,0,imagecolorallocatealpha($mark,0,0,0,55));imagealphablending($mark,true);
        if (!imagettftext($mark,$size,0,6-$left,6-$top,imagecolorallocate($mark,255,255,255),$font,$text)) throw new RuntimeException('Не удалось нарисовать водяной знак.',500);
        $margin=max(0,min(8,(int)floor(min($width,$height)/10)));
        $scale=min(1,($width-2*$margin)/$w,($height-2*$margin)/$h);
        $tw=max(1,(int)floor($w*$scale));$th=max(1,(int)floor($h*$scale));
        imagecopyresampled($dst,$mark,$width-$margin-$tw,$height-$margin-$th,0,0,$tw,$th,$w,$h);
    } finally {imagedestroy($mark);}
}
function motor_gallery_preview(string $source, string $destination, array $settings): void {
    $info=motor_gallery_image_info($source,$settings);
    $budget=motor_media_ini_bytes(ini_get('memory_limit'));
    $need=memory_get_usage(true)+$info[0]*$info[1]*8+$settings['preview_px']**2*8+8*1048576;
    if ($budget>0 && $need>$budget*.9) throw new RuntimeException('Для обработки этого фото недостаточно памяти. Уменьшите разрешение фотографии.',400);
    $loader=[IMAGETYPE_JPEG=>'imagecreatefromjpeg',IMAGETYPE_PNG=>'imagecreatefrompng',IMAGETYPE_GIF=>'imagecreatefromgif',IMAGETYPE_WEBP=>'imagecreatefromwebp'][$info[2]];
    if (!function_exists($loader)) throw new RuntimeException('Сервер не поддерживает обработку этого формата.',400);
    $img=@$loader($source);
    if (!$img) throw new RuntimeException('Изображение повреждено или не может быть прочитано.',400);
    try {
        $orientation=1;
        if ($info[2]===IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $exif=@exif_read_data($source,'IFD0',true,false);$orientation=(int)($exif['IFD0']['Orientation'] ?? 1);
        }
        if (in_array($orientation,[2,4,5,7],true)) imageflip($img,in_array($orientation,[4,5],true)?IMG_FLIP_VERTICAL:IMG_FLIP_HORIZONTAL);
        $angle=[3=>180,4=>180,5=>-90,6=>-90,7=>-90,8=>90][$orientation] ?? 0;
        // Orientation 4 needs only a vertical mirror, not another rotation.
        if ($orientation===4) $angle=0;
        if ($angle) {$rotated=imagerotate($img,$angle,0);if(!$rotated)throw new RuntimeException('Не удалось повернуть фото.',400);imagedestroy($img);$img=$rotated;}
        $scale=min(1,$settings['preview_px']/imagesx($img),$settings['preview_px']/imagesy($img));
        $width=max(1,(int)round(imagesx($img)*$scale));$height=max(1,(int)round(imagesy($img)*$scale));
        $dst=imagecreatetruecolor($width,$height);
        try {
            imagefill($dst,0,0,imagecolorallocate($dst,255,255,255));
            imagecopyresampled($dst,$img,0,0,0,0,$width,$height,imagesx($img),imagesy($img));
            if ($settings['watermark']) motor_gallery_watermark($dst,$settings['watermark_text'] ?? 'WapMotor');
            if (!imagejpeg($dst,$destination,$settings['quality'])) throw new RuntimeException('Не удалось сохранить предпросмотр.',500);
        } finally { imagedestroy($dst); }
    } finally { imagedestroy($img); }
    @chmod($destination,0600);
}
function motor_gallery_cache_path(string $id,array $settings): string {
    $dir=DATADIR.'datagallery/previews';
    if (!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir)) throw new RuntimeException('Не удалось создать каталог предпросмотра.',500);
    return $dir.'/'.$id.'.'.hash('sha256',json_encode(['v3',$settings['preview_px'],$settings['quality'],$settings['watermark'],$settings['watermark']?($settings['watermark_text'] ?? 'WapMotor'):''])).'.jpg';
}
function motor_gallery_upload(array $settings): string {
    $f=$_FILES['file'] ?? null;
    if (!is_array($f) || !is_int($f['error'] ?? null) || $f['error']!==UPLOAD_ERR_OK || !is_string($f['tmp_name'] ?? null) || !is_uploaded_file($f['tmp_name'])) throw new RuntimeException('Фото не загружено или превышает лимит сервера. Выберите файл повторно.',400);
    if (!is_string($f['name'] ?? null)) throw new RuntimeException('Недопустимое имя файла.',400);
    $ext=strtolower(pathinfo($f['name'],PATHINFO_EXTENSION));
    if (!in_array($ext,$settings['formats'],true)) throw new RuntimeException('Этот формат запрещён. Разрешены: '.implode(', ',$settings['formats']).'.',400);
    $size=filesize($f['tmp_name']);
    if ($size<1 || $size>$settings['max_mb']*1048576) throw new RuntimeException('Размер фото должен быть не более '.$settings['max_mb'].' МБ.',400);
    $info=motor_gallery_image_info($f['tmp_name'],$settings);
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $types=['jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','gif'=>'image/gif','webp'=>'image/webp'];
    if (($info['mime'] ?? '')!==$types[$ext] || $mime!==$types[$ext]) throw new RuntimeException('Содержимое фотографии не соответствует её расширению.',400);
    $id=bin2hex(random_bytes(16)).'.'.($ext==='jpeg'?'jpg':$ext);
    $dest=DATADIR.'datagallery/'.$id;$preview=motor_gallery_cache_path($id,$settings);
    try {
        motor_gallery_preview($f['tmp_name'],$preview,$settings);
        if (!move_uploaded_file($f['tmp_name'],$dest)) throw new RuntimeException('Не удалось сохранить фотографию.',500);
        @chmod($dest,0600);
    } catch (Throwable $e) { @unlink($preview);@unlink($dest);throw $e; }
    return $id;
}
function motor_gallery_remove_files(string $id): void {
    if (!motor_gallery_valid_id($id)) return;
    foreach (array_merge([DATADIR.'datagallery/'.$id,DATADIR.'datagallery/'.$id.'.dat'],glob(DATADIR.'datagallery/previews/'.$id.'.*.jpg') ?: []) as $path) if (is_file($path)) @unlink($path);
}
function motor_gallery_card(array $photo, bool $detail=false): void {
    $d=$photo['data'];$id=$d[6];$url=BASEDIR.'gallery/index.php?action=showimg&amp;gid='.rawurlencode($id);
    $hidden=($d[3] ?? '')==='hidden';$settings=motor_gallery_settings();
    echo '<article class="gallery-card"><h2><a href="'.$url.'">'.motor_gallery_escape(motor_gallery_plain($d[1])).'</a></h2>';
    if ($hidden) echo '<p class="gallery-status">Скрыто модератором. Видно только администрации.</p>';
    echo '<a class="gallery-photo" href="'.($detail?BASEDIR.'gallery/fullsize.php?name='.rawurlencode($id):$url).'"'.($detail && $settings['zoom']?' data-gallery-zoom':'').' aria-label="Увеличить фото: '.motor_gallery_escape(motor_gallery_plain($d[1])).'"><img src="'.BASEDIR.'gallery/resize.php?name='.rawurlencode($id).'" alt="'.motor_gallery_escape(motor_gallery_plain($d[1])).'" loading="lazy" decoding="async"></a>';
    echo '<div class="gallery-caption">'.motor_gallery_text($d[0]).'</div><p class="gallery-meta">Добавил: <a href="'.BASEDIR.'pages/anketa.php?uz='.rawurlencode($d[2]).'">'.nickname($d[2]).'</a> · '.date_fixed((int)$d[4]).'</p>';
    echo '<div class="gallery-actions"><a href="'.BASEDIR.'gallery/index.php?action=komm&amp;gid='.rawurlencode($id).'">Комментарии ('.counter_string(DATADIR.'datagallery/'.$id.'.dat').')</a>';
    if ($detail) echo '<a href="'.BASEDIR.'gallery/fullsize.php?name='.rawurlencode($id).'&amp;download=1">Скачать оригинал</a>';
    else echo '<a href="'.$url.'">Открыть фото</a>';
    if (motor_gallery_moderator()) echo '<a href="'.ADMINDIR.'gallery.php?action=edit&amp;gid='.rawurlencode($id).'">Управлять</a>';
    echo '</div></article>';
}
function motor_gallery_request_guard(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '')==='POST') {
        $max=motor_media_ini_bytes(ini_get('post_max_size'));
        if ($max>0 && (int)($_SERVER['CONTENT_LENGTH'] ?? 0)>$max) throw new RuntimeException('Общий размер отправки превышает лимит сервера: '.ini_get('post_max_size').'.',413);
    }
}
function motor_gallery_error(Throwable $e): void {
    $code=$e->getCode();http_response_code($code>=400 && $code<=599?$code:500);
    $message=$e instanceof RuntimeException?$e->getMessage():'Не удалось выполнить действие. Обновите страницу и повторите попытку.';
    show_error(motor_gallery_escape($message));
    if (isset($_POST['msg']) && is_string($_POST['msg'])) echo '<p>Текст не потерян: его можно скопировать и вставить в форму снова.</p><textarea readonly rows="4">'.motor_gallery_escape($_POST['msg']).'</textarea>';
    echo '<p><button type="button" class="primary" onclick="history.back()">Вернуться к форме</button></p>';
}
function motor_gallery_batch_form_start(array $rows): void {
    echo '<form method="post" action="gallery.php?action=batch" class="gallery-moderation">';motor_form_token();motor_gallery_version(implode("\n",$rows));
}
function motor_gallery_batch_controls(): void {
    echo '<fieldset><legend>Действия с выбранными фотографиями</legend><label>Действие<select name="command"><option value="hide">Скрыть от посетителей</option><option value="restore">Вернуть в галерею</option><option value="delete">Удалить навсегда</option></select></label><p>Скрытие сохраняет оригинал и комментарии. Удаление безвозвратно удаляет фото, предпросмотры и комментарии.</p><label><input type="checkbox" name="confirm_delete" value="1"> Подтверждаю безвозвратное удаление (только для действия «Удалить»)</label><button type="submit" class="primary">Применить к выбранным</button></fieldset>';
}
function motor_gallery_serve(bool $preview): never {
    while (ob_get_level()) ob_end_clean();
    header_remove('Content-Encoding');ini_set('zlib.output_compression','0');
    header('X-Content-Type-Options: nosniff');header('Cache-Control: private, no-store');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    if (!in_array($_SERVER['REQUEST_METHOD'],['GET','HEAD'],true)) {http_response_code(405);header('Allow: GET, HEAD');exit;}
    try {
        $id=$_GET['name'] ?? '';
        if (isset($_GET['dir']) || !motor_gallery_valid_id($id)) throw new RuntimeException('',404);
        motor_gallery_lock(false);
        if (!motor_gallery_visible(motor_gallery_find($id))) throw new RuntimeException('',404);
        $path=DATADIR.'datagallery/'.$id;
        if (!is_file($path)) throw new RuntimeException('',404);
        // Existing files remain accessible even when future upload limits are lowered.
        $info=@getimagesize($path);
        if (!$info || !in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_GIF,IMAGETYPE_WEBP],true)) throw new RuntimeException('',404);
        $mime=$info['mime'];
        if ($preview) {
            $settings=motor_gallery_settings();$cache=motor_gallery_cache_path($id,$settings);
            if (!is_file($cache)) {
                $tmp=$cache.'.'.bin2hex(random_bytes(8)).'.tmp';
                try {
                    motor_gallery_preview($path,$tmp,array_merge($settings,['max_side'=>12000,'max_mp'=>24]));
                    if (!rename($tmp,$cache)) throw new RuntimeException('',503);
                } finally {if (is_file($tmp)) @unlink($tmp);}
                // Bound cache space after preview settings change.
                foreach (glob(DATADIR.'datagallery/previews/'.$id.'.*.jpg') ?: [] as $old) if ($old!==$cache) @unlink($old);
            }
            $path=$cache;$mime='image/jpeg';
        }
        $stream=@fopen($path,'rb');if (!$stream) throw new RuntimeException('',404);
        $size=fstat($stream)['size'];session_write_close();
        header('Content-Type: '.$mime);header('Content-Length: '.$size);
        header('Content-Disposition: '.(!$preview && ($_GET['download'] ?? '')==='1'?'attachment':'inline').'; filename="'.($preview?$id.'.jpg':$id).'"');
        if ($_SERVER['REQUEST_METHOD']==='HEAD') {fclose($stream);exit;}
        while (!feof($stream) && !connection_aborted()) { $chunk=fread($stream,65536);if ($chunk===false) break;echo $chunk; }
        fclose($stream);
    } catch (Throwable $e) { http_response_code($e->getCode()===404?404:503); }
    exit;
}
