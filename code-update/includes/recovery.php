<?php
if(!defined('BASEDIR')){http_response_code(403);exit;}
function motor_recovery_issue(int $now): array {
    $token=bin2hex(random_bytes(32));return [$token,'r2:'.($now+43200).':'.hash('sha256',$token)];
}
function motor_recovery_expiry(string $stored): int {
    return preg_match('/^r2:([0-9]{1,12}):[a-f0-9]{64}$/D',$stored,$m)?(int)$m[1]:0;
}
function motor_recovery_valid(string $stored,string $token,int $now): bool {
    $expiry=motor_recovery_expiry($stored);return $expiry>=$now && $expiry>0 && preg_match('/^[a-f0-9]{64}$/D',$token) && hash_equals(substr($stored,strrpos($stored,':')+1),hash('sha256',$token));
}
