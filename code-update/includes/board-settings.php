<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}
function motor_board_settings_validate(array $input): array {
    $out=[];foreach(['count'=>[0,5],'photo_mb'=>[1,motor_media_cap()],'image_px'=>[320,12000],'preview_px'=>[240,1200]] as $key=>[$min,$max]){
        $v=filter_var($input[$key]??null,FILTER_VALIDATE_INT);if($v===false || $v<$min || $v>$max)throw new RuntimeException('Настройка «'.$key.'»: допустимо от '.$min.' до '.$max.'.',400);$out[$key]=$v;
    }
    $formats=$input['formats']??[];
    if(!is_array($formats)||count($formats)>5||count(array_filter($formats,'is_string'))!==count($formats)||array_diff($formats,['jpg','jpeg','png','gif','webp'])||($out['count'] && !$formats))throw new RuntimeException('Выберите допустимые форматы фотографий.',400);
    $out['formats']=array_values(array_unique($formats));return $out;
}
function motor_board_settings(): array {
    $default=['count'=>5,'photo_mb'=>min(8,motor_media_cap()),'image_px'=>8000,'preview_px'=>640,'formats'=>['jpg','jpeg','png','gif','webp']];
    $path=DATADIR.'board-settings.json';if(is_file($path)){$stored=json_decode(file_get_contents($path),true);if(!is_array($stored))throw new RuntimeException('Не удалось прочитать настройки фото объявлений.',500);$default=array_merge($default,$stored);}
    $default['photo_mb']=min((int)$default['photo_mb'],motor_media_cap());return motor_board_settings_validate($default);
}
