<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}
function motor_setting_page_fields(): array {
    return [17=>'postnews',19=>'bookpost',26=>'forumpost',27=>'forumtem',31=>'userlist',35=>'boardspost',37=>'fotolist',40=>'postdown',42=>'downlist',44=>'showuser',46=>'allvotes',49=>'vkladlist',54=>'onlinelist',55=>'smilelist',56=>'submail',60=>'showref',66=>'ziplist',67=>'liblist',68=>'libpost',70=>'avtorlist',92=>'kontaktlist',93=>'ignorlist',94=>'lifelist',96=>'banlist',99=>'maxpostsub',100=>'headlines',105=>'siteinfo',106=>'topforums',116=>'avlist',117=>'editfiles',127=>'loglist',129=>'blacklist'];
}
function motor_setting_validate_post(): void {
    $text=[1,2,8,9,11,12,13,14,15,16,21,82,83,88,113];$pages=motor_setting_page_fields();
    foreach ($_POST as $name=>$value) {
        if (!preg_match('/^set([0-9]+)$/D',$name,$match)) continue;
        $index=(int)$match[1];
        if (!is_string($value)) motor_request_reject(400,'Неверный тип настройки.');
        if (in_array($index,$text,true)) continue;
        if ($index===10) {if (!is_numeric($value) || (float)$value<-24 || (float)$value>24) motor_request_reject(400,'Часовой сдвиг должен быть от −24 до 24.');continue;}
        if (!preg_match('/^[0-9]{1,10}$/D',$value) || (float)$value>9999999999) motor_request_reject(400,'Настройка set'.$index.' должна быть целым неотрицательным числом.');
        if (isset($pages[$index]) && ((int)$value<1 || (int)$value>1000)) motor_request_reject(400,'Количество записей на странице должно быть от 1 до 1000.');
    }
    if (isset($_POST['set121'],$_POST['set122']) && (int)$_POST['set121']>(int)$_POST['set122']) motor_request_reject(400,'Минимальная сумма кредита превышает максимальную.');
}
