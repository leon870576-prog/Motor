<?php
// Explicit CLI only: the web must never trigger a backfill or choose its paths.
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
$app=$argv[1]??'/var/www/html';$data=$argv[2]??'/data/local';$backup=$argv[3]??'/data/motor-backups/comment-activity-r1';
if (!is_dir($app.'/includes') || !is_dir($data)) throw new RuntimeException('Application/data directory missing');
$app=realpath($app);$data=realpath($data);
// Never allow a backup in the public application tree.
$parent=$backup;while (!file_exists($parent) && dirname($parent)!==$parent) $parent=dirname($parent);
$parent=realpath($parent);if ($parent===false || $parent===$app || str_starts_with($parent,$app.'/')) throw new RuntimeException('Backup must be outside the public application tree');
define('BASEDIR',$app.'/');define('DATADIR',$data.'/');
require $app.'/includes/functions.php';require $app.'/includes/userpages.php';
$result=motor_userpage_activity_migrate($backup);
echo 'MOTOR: comment activity synchronized '.json_encode($result,JSON_THROW_ON_ERROR).PHP_EOL;
