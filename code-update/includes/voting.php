<?php
if (!defined('DATADIR')) {http_response_code(403);exit;}
// One stable lock covers the legacy question, totals, voters and admin archive/reset.
function motor_votes_lock(): void {
    static $lock=null;
    if (is_resource($lock)) return;
    $dir=DATADIR.'datavotes';
    if (!is_dir($dir) || is_link($dir) || is_link($dir.'/votes.lock')) throw new RuntimeException('Недоступно хранилище голосования.');
    foreach (['votes.dat','result.dat','users.dat','allvotes.dat','revision.dat'] as $name) if (is_link($dir.'/'.$name)) throw new RuntimeException('Недопустимый файл голосования.');
    $lock=fopen($dir.'/votes.lock','c+b');
    if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('Не удалось заблокировать голосование.');
}
function motor_votes_revision(): string {
    $revision=is_file(DATADIR.'datavotes/revision.dat')?trim(file_get_contents(DATADIR.'datavotes/revision.dat')):'';
    return hash('sha256',$revision."\n".(is_file(DATADIR.'datavotes/votes.dat')?file_get_contents(DATADIR.'datavotes/votes.dat'):''));
}
function motor_votes_form_revision(): void {
    echo '<input type="hidden" name="poll_revision" value="'.motor_votes_revision().'">';
}
function motor_votes_check_revision(): void {
    $revision=$_POST['poll_revision']??'';
    if (!is_string($revision) || !hash_equals(motor_votes_revision(),$revision)) {http_response_code(409);exit('Голосование изменилось. Откройте его заново.');}
}
function motor_votes_new_revision(): void {
    write_files(DATADIR.'datavotes/revision.dat',bin2hex(random_bytes(16)),1,0600);
}
function motor_votes_totals(): array {
    $data=array_pad(explode('|',is_file(DATADIR.'datavotes/result.dat')?file_get_contents(DATADIR.'datavotes/result.dat'):''),12,'0');
    $out=array_fill(0,12,0);for($i=1;$i<=10;$i++)$out[$i]=max(0,(int)$data[$i]);return $out;
}
function motor_votes_submit(string $login,int $option,string $revision): bool {
    motor_votes_lock();
    if (!preg_match('/^[a-z0-9_-]{1,20}$/Di',$login)) throw new InvalidArgumentException('Неверный пользователь.');
    if (!hash_equals(motor_votes_revision(),$revision)) throw new RuntimeException('Голосование изменилось.',409);
    $path=DATADIR.'datavotes/';
    $question=is_file($path.'votes.dat')?explode('|',file_get_contents($path.'votes.dat')):[];
    if ($option<1 || $option>10 || ($question[$option]??'')==='') throw new RuntimeException('Неверный вариант.',400);
    $beforeUsers=is_file($path.'users.dat')?file_get_contents($path.'users.dat'):'';
    if (strlen($beforeUsers)>2097152) throw new RuntimeException('Превышен размер списка голосования.',503);
    foreach (preg_split('/\r\n|\r|\n/',$beforeUsers) as $line) if ((explode('|',$line)[1]??'')===$login) return false;
    $totals=motor_votes_totals();$totals[$option]++;
    $beforeResult=is_file($path.'result.dat')?file_get_contents($path.'result.dat'):'';
    $result='|'.implode('|',array_slice($totals,1,10)).'|';
    $users=$beforeUsers.'|'.$login.'|'.SITETIME."|\r\n";
    if (file_put_contents($path.'result.dat',$result,LOCK_EX)!==strlen($result) || file_put_contents($path.'users.dat',$users,LOCK_EX)!==strlen($users)) {
        file_put_contents($path.'result.dat',$beforeResult,LOCK_EX);file_put_contents($path.'users.dat',$beforeUsers,LOCK_EX);
        throw new RuntimeException('Не удалось сохранить голос.',503);
    }
    return true;
}
