<?php
// Native build gate: no live data, accounts, network or repository credentials.
$root='/var/www/html';
$temp=sys_get_temp_dir().'/motor-gallery-'.bin2hex(random_bytes(8));
mkdir($temp,0700);
define('DATADIR',$temp.'/');
define('BASEDIR',$root.'/');
require_once $root.'/includes/gallery.php';
$settings=['max_side'=>8000,'max_mp'=>24,'preview_px'=>960,'quality'=>90,'watermark'=>0];
function demand(bool $ok,string $message): void {if (!$ok) throw new RuntimeException($message);}
try {
    demand(extension_loaded('exif') && gd_info()['WebP Support'],'Native EXIF/WebP support is required');
    $im=imagecreatetruecolor(300,200);
    $rgb=[[220,30,30],[30,180,30],[30,30,220],[220,180,30]];
    foreach ([[0,0,149,99],[150,0,299,99],[0,100,149,199],[150,100,299,199]] as $i=>$rect) imagefilledrectangle($im,...array_merge($rect,[imagecolorallocate($im,...$rgb[$i])]));
    imagejpeg($im,$temp.'/base.jpg',95);
    $base=file_get_contents($temp.'/base.jpg');
    $maps=[1=>[0,1,2,3],2=>[1,0,3,2],3=>[3,2,1,0],4=>[2,3,0,1],5=>[0,2,1,3],6=>[2,0,3,1],7=>[3,1,2,0],8=>[1,3,0,2]];
    foreach ($maps as $orientation=>$map) {
        $exif="Exif\0\0II\x2a\0".pack('V',8).pack('v',1).pack('vvV',0x0112,3,1).pack('v',$orientation)."\0\0".pack('V',0);
        $jpeg=substr($base,0,2)."\xff\xe1".pack('n',strlen($exif)+2).$exif.substr($base,2);
        file_put_contents($temp.'/oriented.jpg',$jpeg);
        motor_gallery_preview($temp.'/oriented.jpg',$temp.'/preview.jpg',$settings);
        demand(file_get_contents($temp.'/oriented.jpg')===$jpeg,'Original was modified');
        $out=imagecreatefromjpeg($temp.'/preview.jpg');$w=imagesx($out);$h=imagesy($out);
        demand($w===($orientation>=5?200:300) && $h===($orientation>=5?300:200),'EXIF orientation dimensions');
        foreach ([[.25,.25],[.75,.25],[.25,.75],[.75,.75]] as $i=>$point) {
            $color=imagecolorsforindex($out,imagecolorat($out,(int)($w*$point[0]),(int)($h*$point[1])));
            foreach (['red','green','blue'] as $j=>$key) demand(abs($color[$key]-$rgb[$map[$i]][$j])<45,'EXIF orientation '.$orientation.' corner '.$i);
        }
        imagedestroy($out);
    }
    foreach (['png','gif','webp'] as $ext) {
        $encoder='image'.$ext;demand($encoder($im,$temp.'/sample.'.$ext),'Native '.$ext.' encoder');
        motor_gallery_preview($temp.'/sample.'.$ext,$temp.'/preview.jpg',$settings);
        demand(getimagesize($temp.'/preview.jpg')[2]===IMAGETYPE_JPEG,'Native '.$ext.' preview');
    }
    imagedestroy($im);
    $im=imagecreatetruecolor(4000,3000);imagejpeg($im,$temp.'/large.jpg');imagedestroy($im);
    motor_gallery_preview($temp.'/large.jpg',$temp.'/preview.jpg',$settings);
    $info=getimagesize($temp.'/preview.jpg');demand($info[0]===960 && $info[1]===720,'Native 12MP scaling');
    $without=file_get_contents($temp.'/preview.jpg');
    $settings['watermark']=1;
    motor_gallery_preview($temp.'/large.jpg',$temp.'/marked.jpg',$settings);
    $marked=file_get_contents($temp.'/marked.jpg');
    $quant=function($bytes){$pos=strpos($bytes,"\xff\xdb");demand($pos!==false,'Missing JPEG quality table');return substr($bytes,$pos,unpack('n',substr($bytes,$pos+2,2))[1]+2);};
    demand($marked!==$without && $quant($marked)===$quant($without),'Watermark must preserve selected JPEG quality');
    echo "PASS: native gallery JPEG/PNG/GIF/WebP preview; 12MP scaling; all 8 EXIF orientations; watermark quality; originals unchanged\n";
} finally {foreach (glob($temp.'/*') as $file) unlink($file);rmdir($temp);}
