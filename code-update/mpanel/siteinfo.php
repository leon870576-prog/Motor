<?php
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';
if(!is_admin([101,102,103,105])){http_response_code(403);exit('Недостаточно прав.');}
include '../themes/'.$config['themes'].'/index.php';show_title('menu.gif','Информация о портале');
echo '<p>Движок Motor '.htmlspecialchars(MOTOR_VERSION,ENT_QUOTES,'UTF-8').', адаптированный для PHP 8.4.</p><p>Эта сборка обновляется через репозиторий владельца. Старый сервис обновлений WAP-Motor не используется.</p><p><a href="index.php">В админку</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
