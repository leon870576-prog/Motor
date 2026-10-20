<?php
if (!defined('DATADIR')) { http_response_code(403); exit; }
require_once __DIR__.'/nastya.php';
require_once __DIR__.'/chat-jokes.php';

function motor_chat_escape($value): string { return htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
function motor_chat_settings(): array {
    global $config,$con_data;
    $s=['auto_refresh'=>1,'refresh_seconds'=>3,'page_size'=>max(5,min(50,(int)($con_data[23]??10))),
        'history_limit'=>max(50,min(5000,(int)($config['maxpostchat']??500))),
        'bot_enabled'=>(int)!empty($config['botnik']),'joke_enabled'=>(int)!empty($config['shutnik']),
        'quiz_enabled'=>(int)!empty($config['magnik']),'bot_greeting'=>1,'bot_mode'=>'conversation',
        'context_seconds'=>180,'bot_cooldown'=>3,'joke_seconds'=>300,'quiz_seconds'=>600,'quiz_wait'=>60,'custom_rules'=>[]];
    $path=DATADIR.'chat-settings.json';
    if (is_file($path)) {
        $stored=json_decode(file_get_contents($path),true);
        if (!is_array($stored)) throw new RuntimeException('Не удалось прочитать настройки чата.');
        $s=array_replace($s,$stored);
    }
    return $s;
}
function motor_chat_settings_version(): string {
    return hash('sha256',is_file(DATADIR.'chat-settings.json')?file_get_contents(DATADIR.'chat-settings.json'):'defaults');
}
function motor_chat_validate_settings(array $input): array {
    $out=[];
    foreach (['auto_refresh','bot_enabled','joke_enabled','quiz_enabled','bot_greeting'] as $key) {
        if (!isset($input[$key]) || !is_string($input[$key]) || !in_array($input[$key],['0','1'],true)) throw new InvalidArgumentException('Некорректный переключатель.');
        $out[$key]=(int)$input[$key];
    }
    foreach (['refresh_seconds'=>[2,30],'page_size'=>[5,50],'history_limit'=>[50,5000],'context_seconds'=>[30,600],
              'bot_cooldown'=>[0,60],'joke_seconds'=>[60,3600],'quiz_seconds'=>[60,1800],'quiz_wait'=>[30,600]] as $key=>[$min,$max]) {
        if (!isset($input[$key]) || !is_string($input[$key]) || !preg_match('/^\d{1,4}$/D',$input[$key]) || (int)$input[$key]<$min || (int)$input[$key]>$max) throw new InvalidArgumentException('Проверьте числовые значения и указанные границы.');
        $out[$key]=(int)$input[$key];
    }
    if (!isset($input['bot_mode']) || !in_array($input['bot_mode'],['mentions','conversation'],true)) throw new InvalidArgumentException('Неизвестный режим Насти.');
    $out['bot_mode']=$input['bot_mode'];
    if (!isset($input['phrases']) || !is_string($input['phrases']) || strlen($input['phrases'])>50000) throw new InvalidArgumentException('Слишком большой список фраз.');
    $rules=[];
    foreach (preg_split('/\R/u',trim($input['phrases'])) as $line) {
        if (trim($line)==='') continue;
        $parts=explode('=>',$line,2);
        if (count($parts)!==2) throw new InvalidArgumentException('Формат фразы: ключевые слова => ответ.');
        $keys=array_values(array_unique(array_filter(array_map(fn($v)=>motor_nastya_plain(trim($v)),explode(';',$parts[0])))));
        $answer=trim($parts[1]);
        if (!$keys || count($keys)>8 || mb_strlen($answer,'UTF-8')<2 || mb_strlen($answer,'UTF-8')>600 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/',$answer)) throw new InvalidArgumentException('Укажите 1–8 ключей и ответ длиной 2–600 символов.');
        foreach ($keys as $key) if (mb_strlen($key,'UTF-8')>60) throw new InvalidArgumentException('Ключевая фраза длиннее 60 символов.');
        $rules[]=['keys'=>$keys,'answer'=>$answer];
        if (count($rules)>40) throw new InvalidArgumentException('Можно добавить до 40 своих фраз.');
    }
    $out['custom_rules']=$rules;
    return $out;
}
function motor_chat_atomic(string $path,string $contents): void {
    $tmp=$path.'.'.bin2hex(random_bytes(8)).'.tmp';
    if (file_put_contents($tmp,$contents)!==strlen($contents)) { @unlink($tmp);throw new RuntimeException('Не удалось сохранить данные чата.'); }
    @chmod($tmp,0600);
    if (!rename($tmp,$path)) { @unlink($tmp);throw new RuntimeException('Не удалось завершить сохранение чата.'); }
}
function motor_chat_lock() {
    $lock=fopen(DATADIR.'.chat.lock','c');
    if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('Чат временно занят. Повторите действие.');
    return $lock;
}
function motor_chat_rows(): array { return is_file(DATADIR.'chat.dat')?array_values(array_filter(file(DATADIR.'chat.dat',FILE_IGNORE_NEW_LINES),fn($v)=>trim($v)!=='')):[]; }
function motor_chat_transaction(callable $work) {
    $lock=motor_chat_lock();
    try {
        $rows=motor_chat_rows();$before=$rows;
        $state=is_file(DATADIR.'chat-state.json')?json_decode(file_get_contents(DATADIR.'chat-state.json'),true):[];
        if (!is_array($state)) throw new RuntimeException('Не удалось прочитать состояние чата.');
        $oldState=$state;
        $result=$work($rows,$state);
        if ($rows!==$before) {
            motor_chat_atomic(DATADIR.'chat.dat',$rows?implode("\r\n",$rows)."\r\n":'');
            statistics(8,count($rows));
        }
        if ($state!==$oldState) motor_chat_atomic(DATADIR.'chat-state.json',json_encode($state,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        return $result;
    } finally { flock($lock,LOCK_UN);fclose($lock); }
}
function motor_chat_append(array &$rows,string $text,string $author,string $browser,string $ip,int $now,?array $quiz=null,int $joke=0,?string $id=null): void {
    $last=$rows?explode('|',end($rows)):[];
    $quiz ??= [(int)($last[7]??0),(string)($last[8]??'')];
    $rows[]=no_br($text.'|'.$author.'||'.$now.'|'.$browser.'|'.$ip.'|'.$joke.'|'.$quiz[0].'|'.$quiz[1].'|'.($id??bin2hex(random_bytes(16))).'|');
}
function motor_chat_trim(array &$rows,array &$state,array $settings,int $now): void {
    if (count($rows)>$settings['history_limit']) $rows=array_slice($rows,-$settings['history_limit']);
    foreach ($state['users']??[] as $key=>$context) if (max((int)($context['at']??0),(int)($context['welcome']??0))+86400<$now) unset($state['users'][$key]);
    if (count($state['users']??[])>1000) $state['users']=array_slice($state['users'],-1000,null,true);
}
function motor_chat_tick(array $settings,bool $welcome=false): void {
    global $log;
    if (!is_user()) return;
    $now=SITETIME;
    motor_chat_transaction(function (&$rows,&$state) use ($settings,$welcome,$log,$now) {
        $last=$rows?explode('|',end($rows)):[];
        if ($settings['joke_enabled'] && $rows && $now-max((int)($last[3]??0),(int)($state['joke_at']??0))>=$settings['joke_seconds'] && empty($last[6])) {
            $joke=motor_chat_next_joke($state);
            if ($joke!==null) {motor_chat_append($rows,check($joke),'Весельчак','Бот','',$now,null,1);$state['joke_at']=$now;}
        }
        $last=$rows?explode('|',end($rows)):[];
        $deadline=(int)($last[7]??$state['quiz_after']??0);$answer=(string)($last[8]??'');
        if ($settings['quiz_enabled'] && $now>=$deadline) {
            if ($answer!=='') {
                motor_chat_append($rows,'Время вышло. Правильный ответ: [b]'.check($answer).'[/b]. Следующий вопрос через '.$settings['quiz_wait'].' сек.','Вундер-киндер','Бот','',$now,[$now+$settings['quiz_wait'],'']);
            } else {
                $questions=array_values(array_filter(file(__DIR__.'/chat_mag.php',FILE_IGNORE_NEW_LINES),fn($v)=>count(explode('|',$v))>=2));
                if ($questions) {
                    [$question,$correct]=explode('|',$questions[random_int(0,count($questions)-1)]);
                    motor_chat_append($rows,'Вопрос всем: '.check($question).' ('.mb_strlen(trim($correct),'UTF-8').' букв)','Вундер-киндер','Бот','',$now,[$now+$settings['quiz_seconds'],check(trim($correct))]);
                }
            }
        }
        if ($welcome && $settings['bot_enabled'] && $settings['bot_greeting'] && ($state['users'][$log]['welcome']??0)+3600<$now) {
            $context=$state['users'][$log]??[];
            $hello=motor_nastya_choose(['Привет! Я Настя, чат-бот Лесозаводска 🙂 Как проходит день?', 'Привет 🙂 Я Настя, виртуальная собеседница этого чата. О чём хочется поговорить?', 'Здравствуй! Я Настя, бот Лесозаводска. Добро пожаловать в разговор 🙂'],$context);
            $context['welcome']=$now;$state['users'][$log]=$context;
            motor_chat_append($rows,check(nickname($log).', '.$hello),'Настюха','Бот','',$now);
        }
        motor_chat_trim($rows,$state,$settings,$now);
    });
}
function motor_chat_revision(array $rows,array $settings): string {
    return hash('sha256',implode("\n",$rows).json_encode($settings,JSON_UNESCAPED_UNICODE));
}
function motor_chat_is_bot(string $name): bool { return in_array($name,['Настюха','Вундер-киндер','Весельчак','Весальчак'],true); }
function motor_chat_record_id(string $row,int $index): string {
    $data=explode('|',$row);return isset($data[9]) && preg_match('/^[a-f0-9]{32}$/D',$data[9])?$data[9]:substr(hash('sha256',$row.'|'.$index),0,32);
}
function motor_chat_render_row(string $row,int $index): string {
    $data=array_pad(explode('|',$row),10,'');$author=$data[1];$bot=motor_chat_is_bot($author);
    $valid=$bot || (bool)preg_match('/^[a-z0-9-]{3,20}$/Di',$author);
    $name=$valid?nickname($author):'Участник';
    $id=motor_chat_record_id($row,$index);
    $html='<article class="chat-message" id="chat-message-'.$id.'" data-chat-id="'.$id.'" tabindex="-1"><div class="b">';
    $html.=$valid?user_avatars($author):motor_avatar_image('images/avators/guest.gif');
    if ($valid && !$bot) $html.='<b><a class="touch-link chat-author" href="'.BASEDIR.'pages/userpage.php?uz='.rawurlencode($author).'">'.motor_chat_escape($name).'</a></b> ';
    else $html.='<b>'.motor_chat_escape($name).'</b> ';
    $html.='<a class="touch-link chat-reply" data-chat-reply="'.motor_chat_escape($name).'" href="index.php?imja='.safe_encode($name).'#form">Ответить</a> ';
    $html.=$bot?'<span class="chat-bot-label">бот</span>':($valid?user_online($author):'');
    $html.=' <small>('.date_fixed((int)$data[3]).')</small></div><div>'.bb_code($data[0]);
    if (is_admin([101,102,103,105]) && !$bot) $html.='<br /><span class="data">('.motor_chat_escape($data[4]).', '.motor_chat_escape($data[5]).')</span>';
    return $html.'</div></article>';
}
function motor_chat_snapshot(array $settings,int $start=0): array {
    $lock=motor_chat_lock();try {$rows=motor_chat_rows();}finally{flock($lock,LOCK_UN);fclose($lock);}
    $total=count($rows);$start=max(0,$start);if ($start>=$total)$start=0;
    $html='';$ids=[];
    foreach (array_slice(array_reverse(array_keys($rows)),$start,$settings['page_size']) as $i) {
        $html.=motor_chat_render_row($rows[$i],$i);$ids[]=motor_chat_record_id($rows[$i],$i);
    }
    if (!$html) $html='<p class="chat-empty">Сообщений нет, будь первым!</p>';
    ob_start();page_jumpnavigation('index.php?',$settings['page_size'],$start,$total);page_strnavigation('index.php?',$settings['page_size'],$start,$total);$navigation=ob_get_clean();
    return ['revision'=>motor_chat_revision($rows,$settings),'html'=>$html,'ids'=>$ids,'navigation'=>$navigation,'total'=>$total,
        'enabled'=>(bool)$settings['auto_refresh'],'interval'=>$settings['refresh_seconds'],'start'=>$start];
}
function motor_chat_json(array $data,int $status=200): never {
    global $config;
    while(ob_get_level())ob_end_clean();
    header_remove('Content-Encoding');header_remove('Content-Length');
    http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');
    if ($status===204) exit;
    motor_start_compression(!empty($config['gzip']));
    echo json_encode($data,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;
}
