<?php
// Shared WASM/native gate. Reads shipped content only; never opens /data.
function motor_check_chat_catalogue(string $root): array {
    require_once $root.'/includes/nastya.php';
    require_once $root.'/includes/chat-jokes.php';
    $checks=0;$failures=[];
    $ok=function(bool $value,string $label) use (&$checks,&$failures) {$checks++;if (!$value) $failures[]=$label;};
    $topics=motor_nastya_topics();$all=[];
    foreach ($topics as $key=>[$pattern,$answers]) {
        $ok($pattern==='' || preg_match('~(*UCP)'.$pattern.'~u','')!==false,'regex '.$key);
        foreach ($answers as $a) {$all[]=$a;$ok(mb_check_encoding($a,'UTF-8') && mb_strlen($a,'UTF-8')<=600 && !preg_match('/[<>|\x00-\x1F]/',$a),'safe answer '.$key);}
    }
    $ok(count($topics)===152,'152 topics');$ok(count($all)===4000,'4000 variants');$ok(count(array_unique($all))===4000,'4000 distinct variants');
    $data=json_decode(file_get_contents($root.'/includes/nastya-everyday.json'),true);
    $settings=['bot_enabled'=>1,'bot_mode'=>'conversation','bot_cooldown'=>0,'context_seconds'=>180,'custom_rules'=>[]];
    $start=microtime(true);
    foreach ($data as $item) foreach ([$item['example'],mb_strtoupper($item['example'],'UTF-8'),'Привет! '.$item['example']] as $q) {
        $c=[];$a=motor_nastya_reply('Настя, '.$q,$c,$settings,1800000000);
        $ok(is_string($a) && ($c['topic']??'')===$item['key'],'intent '.$item['key'].' got '.($c['topic']??'NULL').' for '.$q);
    }
    $cases=[
        'Почему телефон не заряжается?'=>'daily_battery','Как приготовить рис?'=>'daily_rice',
        'Как сварить макароны?'=>'daily_pasta','Как выбрать ноутбук?'=>'daily_choosing',
        'Что приготовить на завтрак?'=>'daily_breakfast','Что приготовить на ужин?'=>'daily_dinner',
        'Не работает интернет на телефоне'=>'daily_internet','Как восстановить пароль?'=>'daily_password',
        'Как разместить фото на своей странице?'=>'daily_portal_gallery','Как поменять оценку авторитета?'=>'daily_portal_reputation',
        'ПРИВЕТ, КАК ДЕЛА?'=>'wellbeing','Ты робот?'=>'identity',
    ];
    foreach ($cases as $q=>$expected) {$c=[];motor_nastya_reply('Настя, '.$q,$c,$settings,1800000000);$ok(($c['topic']??'')===$expected,'paraphrase '.$q.' got '.($c['topic']??'NULL'));}
    foreach (['Хочу покончить с собой','В квартире запах газа','Не могу дышать'] as $q) {
        $c=[];$s=$settings;$s['custom_rules']=[['keys'=>[motor_nastya_plain($q)],'answer'=>'Custom override']];
        $a=motor_nastya_reply('Настя, '.$q,$c,$s,1800000000);$ok(($c['topic']??'')==='urgent' && $a!=='Custom override','urgent priority');
    }
    $c=[];$ok(motor_nastya_reply("Настя, \xFF",$c,$settings,1800000000)===null,'invalid UTF-8');
    $ok(motor_nastya_reply('Настя, '.str_repeat('a',8001),$c,$settings,1800000000)===null,'oversized input');
    $ok(motor_nastya_reply('[b]Другой[/b], Настя не работает интернет',$c,$settings,1800000000)===null,'recipient isolation');
    $s=$settings;$s['bot_enabled']=0;$ok(motor_nastya_reply('Настя, вайфай',$c,$s,1800000000)===null,'disabled');
    $c=[];$a=motor_nastya_reply('Настя, который час?',$c,$settings,1800000000);$ok(str_contains($a,date('H:i',1800000000)) && !str_contains($a,'{site_'),'site time');
    $c=[];$a=motor_nastya_reply('Настя, какое сегодня число?',$c,$settings,1800000000);$ok(str_contains($a,date('d.m.Y',1800000000)) && !str_contains($a,'{site_'),'site date');
    $c=[];$previous=[];
    for ($i=0;$i<30;$i++) {
        $a=motor_nastya_reply('Настя, телефон быстро разряжается',$c,$settings,1800000000+$i);$core='';
        foreach ($topics['daily_battery'][2] as $value) if (str_starts_with($a,$value.' ')) $core=$value;
        $ok($core!=='' && !in_array($core,$previous,true),'different practical advice, not only different question');
        $previous=array_slice(array_merge($previous,[$core]),-2);
    }
    $jokes=motor_chat_jokes();$ok(count($jokes)===400 && count(array_unique($jokes))===400,'400 distinct jokes');
    $sources=json_decode(file_get_contents($root.'/chat/joke-sources.json'),true);
    foreach ($jokes as $i=>$joke) $ok(($sources['selected'][$i]['sha256']??'')===hash('sha256',$joke),'joke provenance '.$i);
    $state=[];$last=null;
    for ($round=0;$round<3;$round++) {
        $seen=[];
        for ($i=0;$i<400;$i++) {
            // Serialize between every call, as across PHP requests/restarts.
            $state=json_decode(json_encode($state),true);$a=motor_chat_next_joke($state);
            $ok(is_string($a) && in_array($a,$jokes,true) && !isset($seen[$a]) && $a!==$last,'joke cycle '.$round.'/'.$i);
            $seen[$a]=true;$last=$a;
        }
        $ok(count($seen)===400,'full cycle '.$round);
    }
    foreach ([null,['version'=>'old'],['version'=>$state['joke_cycle']['version'],'remaining'=>[1,1],'last'=>3],['version'=>$state['joke_cycle']['version'],'remaining'=>['x'],'last'=>3]] as $bad) {
        $state=['joke_cycle'=>$bad,'contexts'=>['user'=>['topic'=>'music']]];$a=motor_chat_next_joke($state);
        $ok(in_array($a,$jokes,true) && count($state['joke_cycle']['remaining'])===399 && $state['contexts']['user']['topic']==='music','invalid cycle recovery preserves other state');
    }
    if ($failures) throw new RuntimeException(implode("\n",$failures));
    return ['assertions'=>$checks,'topics'=>count($topics),'variants'=>count($all),'jokes'=>count($jokes),'seconds'=>round(microtime(true)-$start,3)];
}
