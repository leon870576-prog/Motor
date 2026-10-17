<?php
require_once __DIR__.'/includes/start.php';
require_once __DIR__.'/includes/functions.php';
require_once __DIR__.'/includes/header.php';
require_once __DIR__.'/includes/attachments.php';
// Keep the engine's login, site closure and ban checks, then switch to binary output.
while (ob_get_level()) ob_end_clean();
header_remove('Content-Encoding');
ini_set('zlib.output_compression', '0');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-cache');
header("Content-Security-Policy: default-src 'none'; sandbox");
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','HEAD'], true)) { http_response_code(405); header('Allow: GET, HEAD'); exit; }
$section = $_GET['section'] ?? '';
$parent = $_GET['parent'] ?? '';
$id = $_GET['file'] ?? '';
if (!motor_media_valid_parent($section, $parent) || !is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) { http_response_code(404); exit; }
$manifest = motor_media_manifest($section, $parent);
$exists = false;
if ($section === 'news') {
    $exists = (bool)search_string(DATADIR.'news.dat', $parent, 5);
} elseif ($section === 'board') {
    require_once __DIR__.'/includes/board.php';
    try {
        $category=motor_board_number($manifest['context']['category'] ?? '');
        $bid=motor_board_number($manifest['context']['bid'] ?? '');
        $record=motor_board_find($category,$bid);
        $exists=$record && motor_board_parent($record['data'])===$parent;
    } catch (Throwable $e) {$exists=false;}
} else {
    $fid = (int)($manifest['context']['fid'] ?? 0); $topic = (int)($manifest['context']['topic'] ?? 0);
    $path = DATADIR.'dataforum/'.$fid.'-'.$topic.'.dat';
    if (is_file($path) && is_file(DATADIR.'dataforum/topic'.$fid.'.dat') && search_string(DATADIR.'dataforum/mainforum.dat', $fid, 0) && search_string(DATADIR.'dataforum/topic'.$fid.'.dat', $topic, 0)) {
        foreach (file($path) as $line) { $data = explode('|', $line); if (trim($data[6] ?? '') === $parent) { $exists = true; break; } }
    }
}
$file = null;
foreach ($manifest['files'] as $candidate) if ($candidate['id'] === $id) { $file = $candidate; break; }
$path = motor_media_dir($section, $parent).'/'.$id.'.blob';
if (!$exists || !$file || !is_file($path) || is_link($path)) { http_response_code(404); exit; }
// Thumbnails are derived from the original only after the parent record is authorized.
if ($section==='board' && isset($_GET['preview']) && empty($_GET['download'])) {
    require_once __DIR__.'/includes/gallery.php';
    $settings=motor_board_settings();$preview=motor_media_dir($section,$parent).'/'.$id.'.'.$settings['preview_px'].'.preview.jpg';
    try {
        motor_media_lock();
        // A concurrent deletion must not recreate files for a deleted advertisement.
        $record=motor_board_find($category,$bid);
        if (!$record || motor_board_parent($record['data'])!==$parent || !is_file($path) || is_link($path)) {http_response_code(404);exit;}
        if (!is_file($preview) || is_link($preview)) {
            $tmp=$preview.'.'.motor_media_uuid().'.tmp';
            try {
                motor_gallery_preview($path,$tmp,['preview_px'=>$settings['preview_px'],'max_side'=>12000,'max_mp'=>40,'watermark'=>0,'quality'=>82]);
                if (!rename($tmp,$preview)) throw new RuntimeException('Cannot save preview.');
                foreach(glob(motor_media_dir($section,$parent).'/'.$id.'.*.preview.jpg') as $old) if($old!==$preview) unlink($old);
            } finally {if(is_file($tmp))unlink($tmp);}
        }
        $path=$preview;$file['mime']='image/jpeg';$file['ext']='jpg';$file['name']='photo.jpg';
    } catch(Throwable $e) {http_response_code(400);exit;}
}
$stream = @fopen($path, 'rb');
if (!$stream) { http_response_code(404); exit; }
$size = fstat($stream)['size']; $start = 0; $end = $size - 1;
session_write_close();
header('Accept-Ranges: bytes');
if (isset($_SERVER['HTTP_RANGE'])) {
    $valid = preg_match('/^bytes=(\d*)-(\d*)$/D', trim($_SERVER['HTTP_RANGE']), $range);
    if ($valid && ($range[1] !== '' || $range[2] !== '')) {
        if ($range[1] === '') { $length = (int)$range[2]; $start = max(0, $size - $length); if ($length < 1) $valid = false; }
        else { $start = (int)$range[1]; if ($range[2] !== '') $end = min($end, (int)$range[2]); }
        if ($start > $end || $start >= $size) $valid = false;
    } else $valid = false;
    if (!$valid) { http_response_code(416); header('Content-Range: bytes */'.$size); exit; }
    http_response_code(206); header('Content-Range: bytes '.$start.'-'.$end.'/'.$size);
}
$inline = $file['kind'] !== 'file' && empty($_GET['download']);
header('Content-Type: '.$file['mime']);
header('Content-Disposition: '.($inline ? 'inline' : 'attachment').'; filename="attachment.'.$file['ext'].'"; filename*=UTF-8\'\''.rawurlencode($file['name']));
header('Content-Length: '.($end - $start + 1));
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
fseek($stream, $start); $remaining = $end - $start + 1;
while ($remaining > 0 && !feof($stream) && !connection_aborted()) {
    $chunk = fread($stream, min(65536, $remaining)); if ($chunk === false || $chunk === '') break;
    echo $chunk; $remaining -= strlen($chunk);
}
fclose($stream);
