<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}

// Fixed local editorial data, never executable or supplied by a visitor.
function motor_nastya_everyday(): array {
    static $topics;
    if ($topics!==null) return $topics;
    $topics=[];$path=__DIR__.'/nastya-everyday.json';
    if (is_link($path) || !is_file($path) || filesize($path)>524288) return $topics;
    $data=json_decode((string)file_get_contents($path),true,12);
    if (!is_array($data) || !array_is_list($data) || count($data)!==100) return $topics;
    $out=[];
    foreach ($data as $item) {
        if (!is_array($item) || !is_string($item['key']??null) || !preg_match('/^daily_[a-z_]{1,32}$/D',$item['key']) || isset($out[$item['key']]) || !is_string($item['pattern']??null) || strlen($item['pattern'])>600 || !is_array($item['answers']??null) || !is_array($item['followups']??null) || count($item['answers'])!==5 || count($item['followups'])!==8 || !in_array($item['limit']??null,[37,38],true)) return $topics;
        $answers=[];
        foreach ($item['answers'] as $core) foreach ($item['followups'] as $end) {
            if (!is_string($core) || !is_string($end) || mb_strlen($core.' '.$end,'UTF-8')>600 || preg_match('/[<>|\x00-\x1F]/',$core.$end)) return $topics;
            $answers[]=$core.' '.$end;
        }
        $out[$item['key']]=['\\b(?:'.$item['pattern'].')\\w*\\b',array_slice($answers,0,$item['limit']),$item['answers']];
    }
    return $topics=$out;
}

function motor_nastya_site_time(string $text,int $now): string {
    if (!str_contains($text,'{site_')) return $text;
    $days=['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
    return strtr($text,['{site_time}'=>date('H:i',$now),'{site_date}'=>date('d.m.Y',$now).', '.$days[(int)date('w',$now)]]);
}

// Safety takes priority over small talk, custom phrases and jokes.
function motor_nastya_urgent(string $text): ?string {
    if (preg_match('~(?:хочу|собираюсь|решил|решила).{0,25}(?:покончить с собой|убить себя|суицид)|не хочу жить|хочу умереть~u',$text)) return 'Мне жаль, что тебе сейчас так тяжело. Если можешь причинить себе вред прямо сейчас, отойди от опасных предметов и обратись в местную экстренную службу или к человеку рядом. Я могу выслушать, но не заменяю живую помощь. Ты сейчас в безопасности?';
    if (preg_match('~запах газа|пахнет газом|утечка газа~u',$text)) return 'При подозрении на утечку газа выйди в безопасное место, не пользуйся огнём и электрическими выключателями рядом с утечкой. Позвони в местную аварийную газовую или экстренную службу из безопасного места.';
    if (preg_match('~(?:пожар|горит квартира|горит дом|не могу дышать|сильная боль в груди|потерял сознание|потеряла сознание)~u',$text)) return 'Это может быть срочная ситуация. Обратись в местную экстренную службу сейчас и следуй указаниям диспетчера. Если можешь безопасно позвать человека рядом, сделай это; не откладывай помощь ради переписки.';
    return null;
}
