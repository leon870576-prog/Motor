<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}

function motor_userpage_validate_comments(array $data): void {
    $total=0;$seen=[];
    foreach ($data['news'] as $news) {
        $rows=$news['comments']??[];
        if (!is_array($rows) || !array_is_list($rows) || count($rows)>500) throw new RuntimeException('Комментарии повреждены.',503);
        $total+=count($rows);
        foreach ($rows as $row) {
            if (!is_array($row) || !is_string($row['id']??null) || !preg_match('/^[a-f0-9]{32}$/D',$row['id']) || isset($seen[$row['id']]) || !motor_userpage_login($row['author']??null)) throw new RuntimeException('Комментарий повреждён.',503);
            $seen[$row['id']]=true;
            foreach (['created','updated','revision'] as $key) if (!is_int($row[$key]??null) || $row[$key]<1) throw new RuntimeException('Комментарий повреждён.',503);
            motor_userpage_text_input($row['text']??null,1,2000);
        }
    }
    if ($total>2000) throw new RuntimeException('Превышен лимит комментариев страницы.',503);
    motor_userpage_comment_totals($data['comment_totals']??[]);
    motor_userpage_comment_totals($data['review_totals']??[]);
}
function motor_userpage_comment_totals($value): array {
    if (!is_array($value) || count($value)>10000) throw new RuntimeException('Счётчики комментариев повреждены.',503);
    foreach ($value as $name=>$count) if (!motor_userpage_login((string)$name) || !is_int($count) || $count<0 || $count>1000000000) throw new RuntimeException('Счётчик комментариев повреждён.',503);
    return $value;
}
function motor_userpage_comment_receipts($value): array {return motor_userpage_activity_receipts($value)['news'];}
function motor_userpage_comment_sync(string $actor,string $owner,int $total): void {motor_userpage_activity_sync($actor,$owner,$total,null);}
function motor_userpage_comment_apply(string $owner,string $actor,bool $staff,string $action,array $input,int $now,array $profile): array {
    global $config;
    if (!in_array($action,['comment_add','comment_edit','comment_delete'],true)) throw new RuntimeException('Неизвестное действие.',400);
    $post=motor_userpage_id($input['post']??null);$id=motor_userpage_id($input['id']??null);
    motor_userpage_comment_receipts($profile[97]??null);
    if ($action==='comment_add' && (int)($profile[6]??0)+(int)($config['karantin']??0)>$now) throw new RuntimeException('Дождитесь окончания карантина нового аккаунта.',403);
    return motor_userpage_mutate($owner,function(array $data) use($owner,$actor,$staff,$action,$input,$now,$config,$post,$id): array {
        if (!$data['created'] || !$data['published'] && $actor!==$owner && !$staff) throw new RuntimeException('Страница пока не опубликована.',404);
        // Repair an already committed count even if its news was deleted before retry.
        motor_userpage_comment_sync($actor,$owner,$data['comment_totals'][$actor]??0);
        $index=null;foreach ($data['news'] as $i=>$news) if ($news['id']===$post) {$index=$i;break;}
        if ($index===null) throw new RuntimeException('Новость не найдена.',404);
        $rows=$data['news'][$index]['comments']??[];
        $at=null;foreach ($rows as $i=>$row) if ($row['id']===$id) {$at=$i;break;}
        if ($action==='comment_add') {
            $text=motor_userpage_text_input($input['msg']??null,1,2000);$hash=hash('sha256',$post."\0".$text);
            foreach ($data['recent'] as $r) if ($r['id']===$id) {
                if ($r['actor']===$actor && $r['kind']===$action && hash_equals($r['hash'],$hash)) return $data;
                throw new RuntimeException('Форма уже использована. Откройте новую форму.',409);
            }
            $count=0;foreach ($data['news'] as $news) {foreach ($news['comments']??[] as $row) if ($row['id']===$id) throw new RuntimeException('Такой комментарий уже существует.',409);$count+=count($news['comments']??[]);}
            $interval=max(5,min(300,(int)($config['floodstime']??15)));
            foreach ($data['recent'] as $r) if ($r['actor']===$actor && $r['time']+$interval>$now) throw new RuntimeException('Подождите '.$interval.' секунд перед следующей публикацией.',429);
            if (count($rows)>=500 || $count>=2000) throw new RuntimeException('Достигнут лимит комментариев: 500 к новости или 2000 на странице.',409);
            $rows[]=['id'=>$id,'author'=>$actor,'text'=>$text,'created'=>$now,'updated'=>$now,'revision'=>1];
            $data['comment_totals'][$actor]=($data['comment_totals'][$actor]??0)+1;
            $data['recent'][]=['id'=>$id,'actor'=>$actor,'kind'=>$action,'hash'=>$hash,'time'=>$now];$data['recent']=array_slice($data['recent'],-128);
        } else {
            if ($at===null) throw new RuntimeException('Комментарий не найден.',404);
            $row=$rows[$at];$delete=$action==='comment_delete';
            if ($delete? !($actor===$row['author'] || $actor===$owner || $staff):($actor!==$row['author'] && !motor_userpage_manager($actor))) throw new RuntimeException('Недостаточно прав для изменения комментария.',403);
            motor_userpage_version($input['revision']??null,$row['revision']);
            if ($delete) array_splice($rows,$at,1);
            else {$rows[$at]['text']=motor_userpage_text_input($input['msg']??null,1,2000);$rows[$at]['revision']++;$rows[$at]['updated']=$now;}
        }
        $data['news'][$index]['comments']=$rows;$data['revision']++;$data['updated']=$now;
        $data['audit'][]=['time'=>$now,'actor'=>$actor,'action'=>$action,'id'=>$id,'post'=>$post];$data['audit']=array_slice($data['audit'],-100);
        return $data;
    },function(array $data) use($actor,$owner): void {motor_userpage_comment_sync($actor,$owner,$data['comment_totals'][$actor]??0);});
}
function motor_userpage_public_comment_count(): int {
    $root=DATADIR.'userpages';if (!is_dir($root) || is_link($root)) return 0;
    $total=0;
    foreach (glob($root.'/*.json')?:[] as $path) {
        $owner=basename($path,'.json');if (!motor_userpage_login($owner) || is_link($path)) continue;
        try {motor_userpage_profile($owner);$data=motor_userpage_read($owner);} catch (Throwable $e) {continue;}
        if ($data['created'] && $data['published']) foreach ($data['news'] as $news) $total+=count($news['comments']??[]);
    }
    return $total;
}
