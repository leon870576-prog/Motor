<?php
define('MOTOR_CHAT_POLL',true);
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/chat.php';
$method=$_SERVER['REQUEST_METHOD']??'GET';
if (!in_array($method,['GET','POST'],true)) motor_chat_json(['error'=>'Метод не поддерживается.'],405);
if ($method==='POST') {
    $token=$_POST['uid']??'';
    if (!is_user() || !is_string($token) || empty($_SESSION['token']) || !hash_equals($_SESSION['token']??'',$token)) motor_chat_json(['error'=>'Обновите страницу и войдите на сайт.'],403);
}
$revision=($method==='POST'?$_POST:$_GET)['revision']??'';
if (!is_string($revision) || ($revision!=='' && !preg_match('/^[a-f0-9]{64}$/D',$revision))) motor_chat_json(['error'=>'Неверная версия чата.'],400);
$settings=motor_chat_settings();
if ($method==='POST' && ($_SESSION['chat_tick_at']??0)+2<=SITETIME) { motor_chat_tick($settings);$_SESSION['chat_tick_at']=SITETIME; }
$lock=motor_chat_lock();
try {$current=motor_chat_revision(motor_chat_rows(),$settings);}finally{flock($lock,LOCK_UN);fclose($lock);}
if ($revision!=='' && hash_equals($current,$revision)) motor_chat_json([],204);
motor_chat_json(motor_chat_snapshot($settings));
