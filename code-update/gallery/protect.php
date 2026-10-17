<?php
require_once '../includes/start.php';
require_once '../includes/captcha.php';

header('Cache-Control: private, no-store, no-cache, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');
header('Vary: Cookie');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
$code = $_SESSION['protect'] ?? null;
if ((!is_string($code) && !is_int($code)) || !preg_match('/^[1-9][0-9]{3}$/D', (string)$code)) {
    http_response_code(404);
    exit;
}
$image = motor_captcha_image((string)$code, !empty($config['protectdef']));
ob_start();
imagepng($image);
$png = ob_get_clean();
imagedestroy($image);
header('Content-Type: image/png');
header('Content-Length: '.strlen($png));
if ($method !== 'HEAD') echo $png;
