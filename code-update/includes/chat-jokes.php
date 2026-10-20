<?php
if (!defined('BASEDIR')) {http_response_code(403);exit;}

function motor_chat_jokes(): array {
    static $jokes;
    if ($jokes!==null) return $jokes;
    $jokes=[];$path=__DIR__.'/chat_shut.php';
    if (is_link($path) || !is_file($path) || filesize($path)>524288) return $jokes;
    $lines=file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines) || count($lines)!==400) return $jokes;
    foreach ($lines as $line) if (!mb_check_encoding($line,'UTF-8') || mb_strlen($line,'UTF-8')>999 || preg_match('/[<>|\x00-\x1F]/',$line)) return $jokes;
    if (count(array_unique($lines))!==400) return $jokes;
    return $jokes=$lines;
}

// Called only inside the existing chat lock/transaction. The bag survives restarts.
function motor_chat_next_joke(array &$state): ?string {
    $jokes=motor_chat_jokes();if (!$jokes) return null;
    $version=hash('sha256',implode("\n",$jokes));$cycle=$state['joke_cycle']??null;
    $valid=is_array($cycle) && ($cycle['version']??'')===$version && is_array($cycle['remaining']??null) && array_is_list($cycle['remaining']) && count($cycle['remaining'])<=400 && is_int($cycle['last']??null) && $cycle['last']>=0 && $cycle['last']<400;
    if ($valid) {
        $seen=[];
        foreach ($cycle['remaining'] as $id) {
            if (!is_int($id) || $id<0 || $id>=400 || $id===$cycle['last'] || isset($seen[$id])) {$valid=false;break;}
            $seen[$id]=true;
        }
    }
    if (!$valid) $cycle=['version'=>$version,'remaining'=>[],'last'=>-1];
    if (!$cycle['remaining']) {
        $cycle['remaining']=range(0,399);
        for ($i=399;$i>0;$i--) {$j=random_int(0,$i);[$cycle['remaining'][$i],$cycle['remaining'][$j]]=[$cycle['remaining'][$j],$cycle['remaining'][$i]];}
        if (end($cycle['remaining'])===$cycle['last']) [$cycle['remaining'][0],$cycle['remaining'][399]]=[$cycle['remaining'][399],$cycle['remaining'][0]];
    }
    $id=array_pop($cycle['remaining']);$cycle['last']=$id;$state['joke_cycle']=$cycle;
    return $jokes[$id];
}
