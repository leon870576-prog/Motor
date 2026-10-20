<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/chat.php';
include '../themes/'.$config['themes'].'/index.php';
show_title('partners.gif','Боты мини-чата');
$topics=motor_nastya_topics();
echo '<div class="b"><h2>Настя</h2><p>Обратись по имени, например: «Настя, почему телефон не заряжается?» или «Настя, что приготовить на ужин?». Во время недавнего разговора имя можно не повторять, если это разрешено в настройках чата.</p>';
echo '<p>В базе '.count($topics).' темы и '.array_sum(array_map(fn($v)=>count($v[1]),$topics)).' вариантов реплик. Новые ответы составляются из подготовленного совета и подходящего уточняющего вопроса. Настя работает без внешнего сервиса и может не понять вопрос; попробуй уточнить его или назвать тему.</p>';
echo '<p>Настя не ищет свежие сведения в интернете. Погоду, цены и расписания нужно проверять в актуальных источниках. Время и дата соответствуют настройкам сайта. Советы бота не заменяют специалиста или экстренную помощь.</p>';
echo '<h2>Весельчак</h2><p>В подборке '.count(motor_chat_jokes()).' анекдотов без мата, религии и политики. Он рассказывает их в случайном порядке, без повторов до конца полного круга. Очередь сохраняется между перезапусками.</p>';
echo '<p>Источник: <a href="https://huggingface.co/datasets/gorovuha/CleanComedy" rel="noopener noreferrer">CleanComedy</a>, Dmitry Vikhorev, Daria Galimzianova, Svetlana Gorovaia, Elizaveta Zhemchuzhina и Ivan P. Yamshchikov. Лицензия <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a> (<a href="cleancomedy-license.txt">полный текст</a>). Выполнены ручной отбор, удаление повторов и нормализация пробелов. Это редакционная подборка, а не объективный рейтинг всего Рунета. <a href="joke-sources.json">Источники выбранных анекдотов</a>.</p></div>';
echo '<p><a class="touch-link" href="index.php">В мини-чат</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
