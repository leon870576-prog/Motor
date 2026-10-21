<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}

// Profile field 19 is text: preserve the international prefix and leading zeroes.
function motor_profile_phone($value): string {
    if (!is_string($value) || strlen($value)>40 || preg_match('/[\r\n\x00-\x1f\x7f]/',$value)) throw new RuntimeException('Номер телефона: от 5 до 20 цифр, необязательный + в начале, пробелы, скобки и дефисы.',400);
    $value=trim($value);
    if ($value==='') return '';
    $digits=preg_replace('/[^0-9]/','',$value);
    if (!preg_match('/^\+?[0-9 ()-]+$/D',$value) || strlen($digits)<5 || strlen($digits)>20) throw new RuntimeException('Номер телефона: от 5 до 20 цифр, необязательный + в начале, пробелы, скобки и дефисы.',400);
    return $value;
}
