<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }

// Fixed dimensions and font path: request parameters cannot select files or allocate images.
function motor_captcha_image(string $code, bool $noise): GdImage {
    if (!preg_match('/^[1-9][0-9]{3}$/D', $code)) throw new InvalidArgumentException('Invalid verification code');
    $image = imagecreatetruecolor(504, 192);
    $background = imagecolorallocate($image, 255, 255, 255);
    imagefill($image, 0, 0, $background);
    $font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $useFont = is_readable($font) && function_exists('imagettftext');
    if ($noise) {
        imagesetthickness($image, 2);
        for ($i = 0; $i < 5; $i++) {
            $color = imagecolorallocate($image, random_int(170, 210), random_int(170, 210), random_int(170, 210));
            imageline($image, random_int(0, 503), random_int(0, 191), random_int(0, 503), random_int(0, 191), $color);
        }
    }
    foreach (str_split($code) as $index => $digit) {
        $color = imagecolorallocate($image, 35 + $index * 9, 45, 65 + $index * 5);
        $centerX = 63 + $index * 126 + ($noise ? random_int(-4, 4) : 0);
        $centerY = 96 + ($noise ? random_int(-6, 6) : 0);
        $angle = $noise ? random_int(-8, 8) : 0;
        $drawn = false;
        if ($useFont) {
            $box = imagettfbbox(104, $angle, $font, $digit);
            if ($box !== false) {
                $xs = [$box[0], $box[2], $box[4], $box[6]];
                $ys = [$box[1], $box[3], $box[5], $box[7]];
                $x = (int)round($centerX - (min($xs) + max($xs)) / 2);
                $y = (int)round($centerY - (min($ys) + max($ys)) / 2);
                $drawn = imagettftext($image, 104, $angle, $x, $y, $color, $font, $digit) !== false;
            }
        }
        if (!$drawn) {
            // GD-only fallback for installations without FreeType or the bundled font.
            $glyph = imagecreatetruecolor(9, 15);
            imagefill($glyph, 0, 0, imagecolorallocate($glyph, 255, 255, 255));
            imagestring($glyph, 5, 0, 0, $digit, imagecolorallocate($glyph, 35 + $index * 9, 45, 65 + $index * 5));
            imagecopyresized($image, $glyph, $centerX - 27, $centerY - 45, 0, 0, 54, 90, 9, 15);
            imagedestroy($glyph);
        }
    }
    if ($noise) {
        for ($i = 0; $i < 80; $i++) {
            $color = imagecolorallocate($image, random_int(120, 210), random_int(120, 210), random_int(120, 210));
            imagesetpixel($image, random_int(0, 503), random_int(0, 191), $color);
        }
    }
    return $image;
}
