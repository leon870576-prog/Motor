<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/chat.php';
if (!is_admin([101])) { http_response_code(403);exit('Недостаточно прав.'); }
$settings=motor_chat_settings();$error='';
if (($_SERVER['REQUEST_METHOD']??'')==='POST') {
    motor_form_guard([]);
    try {
        $next=motor_chat_validate_settings($_POST);
        $version=$_POST['version']??'';
        if (!is_string($version)) throw new InvalidArgumentException('Неверная версия настроек.');
        $lock=motor_chat_lock();
        try {
            if (!hash_equals(motor_chat_settings_version(),$version)) throw new RuntimeException('Настройки уже изменены. Откройте форму заново.',409);
            motor_chat_atomic(DATADIR.'chat-settings.json',json_encode($next,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        } finally {flock($lock,LOCK_UN);fclose($lock);}
        header('Location: chat-settings.php?isset=mp_yesset');exit;
    } catch (InvalidArgumentException $e) {http_response_code(400);$error=$e->getMessage();}
      catch (RuntimeException $e) {http_response_code($e->getCode()===409?409:503);$error=$e->getMessage();}
}
include '../themes/'.$config['themes'].'/index.php';
show_title('chat.gif','Настройки мини-чата');
echo '<link rel="stylesheet" href="../assets/lesika/chat.css?v=chat1">';
if ($error!=='') echo '<p class="chat-settings-error" role="alert">'.motor_chat_escape($error).'</p>';
echo '<form class="chat-settings" method="post">';motor_form_token();
echo '<input type="hidden" name="version" value="'.motor_chat_settings_version().'">';
function chat_setting_select(string $key,string $label,array $options): void {
    global $settings;
    echo '<label for="'.$key.'">'.$label.'</label><select id="'.$key.'" name="'.$key.'">';
    foreach ($options as $value=>$text) echo '<option value="'.motor_chat_escape($value).'"'.((string)$settings[$key]===(string)$value?' selected':'').'>'.$text.'</option>';
    echo '</select>';
}
function chat_setting_number(string $key,string $label,int $min,int $max): void {
    global $settings;
    echo '<label for="'.$key.'">'.$label.'</label><input type="number" id="'.$key.'" name="'.$key.'" min="'.$min.'" max="'.$max.'" value="'.(int)$settings[$key].'" required><small>От '.$min.' до '.$max.'.</small>';
}
echo '<fieldset><legend>Сообщения и обновление</legend>';
chat_setting_select('auto_refresh','Автоматически показывать новые сообщения',[1=>'Включено',0=>'Выключено']);
chat_setting_number('refresh_seconds','Интервал обновления, секунд',2,30);
echo '<small>Обновляется только список сообщений. На скрытой вкладке запросы приостанавливаются.</small>';
chat_setting_number('page_size','Сообщений на странице',5,50);
chat_setting_number('history_limit','Сообщений хранить в чате',50,5000);
echo '<small>Лишние старые сообщения удаляются при следующей записи в чат.</small></fieldset><fieldset><legend>Настя — собеседница</legend>';
chat_setting_select('bot_enabled','Настя',[1=>'Включена',0=>'Выключена']);
chat_setting_select('bot_greeting','Приветствовать вошедших участников',[1=>'Да, не чаще раза в час для участника',0=>'Нет']);
chat_setting_select('bot_mode','Когда отвечать',['conversation'=>'При обращении и в продолжение недавнего разговора','mentions'=>'Только при обращении или общем приветствии']);
chat_setting_number('context_seconds','Сколько секунд продолжать разговор без повторения имени',30,600);
chat_setting_number('bot_cooldown','Минимальная пауза между ответами одному участнику, секунд',0,60);
$topics=motor_nastya_topics();$phrases=array_sum(array_map(fn($v)=>count($v[1]),$topics));
echo '<p>Встроено '.count($topics).' тем и '.$phrases.' вариантов ответа. Настя помечена как бот, учитывает недавнюю тему и избегает повторов.</p>';
$lines=[];foreach ($settings['custom_rules'] as $rule) $lines[]=implode('; ',$rule['keys']).' => '.$rule['answer'];
echo '<label for="phrases">Дополнительные ответы Насти</label><textarea name="phrases" id="phrases" rows="8" placeholder="выходные; суббота => Какие планы на выходные?">'.motor_chat_escape(implode("\n",$lines)).'</textarea>';
echo '<small>Одна строка: ключевая фраза; другая фраза =&gt; ответ. До 40 строк. Эти ответы срабатывают в разговоре с Настей; регулярные выражения не используются.</small></fieldset>';
echo '<fieldset><legend>Другие боты</legend>';
chat_setting_select('joke_enabled','Весельчак',[1=>'Включён',0=>'Выключен']);
chat_setting_number('joke_seconds','Пауза без сообщений перед шуткой, секунд',60,3600);
chat_setting_select('quiz_enabled','Вундер-киндер',[1=>'Включён',0=>'Выключен']);
chat_setting_number('quiz_seconds','Время на ответ в викторине, секунд',60,1800);
chat_setting_number('quiz_wait','Пауза до следующего вопроса, секунд',30,600);
echo '<small>Боты по таймеру работают, пока чат открыт хотя бы у одного вошедшего участника.</small></fieldset>';
echo '<input type="submit" value="Сохранить настройки"></form><p><a class="touch-link" href="chat.php">Управление сообщениями</a> / <a class="touch-link" href="../chat/index.php">Открыть чат</a> / <a class="touch-link" href="index.php">В админку</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
