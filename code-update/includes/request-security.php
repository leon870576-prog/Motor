<?php
if(!defined('BASEDIR')){http_response_code(403);exit;}
// Legacy forms share one CSRF policy. Specific controllers still enforce permissions.
function motor_request_reject(int $status,string $message): never {http_response_code($status);header('Content-Type: text/plain; charset=UTF-8');exit($message);}
function motor_request_actions(): array {
    return ['input.php'=>['exit'],'games/bank.php'=>['operacia'],'games/kredit.php'=>['operacia'],'games/perevod.php'=>['go'],'pages/account.php'=>['editmail'],'games/loterea.php'=>['bilet'],
        'games/hi.php'=>['hi'],'games/kosti.php'=>['go'],'games/naperstki.php'=>['go'],'games/bandit.php'=>['go'],
        'games/health.php'=>['operacia'],'games/stamina.php'=>['operacia'],'games/magazin.php'=>['shop'],
        'games/21.php'=>['ini','game'],'votes/vote.php'=>['vote'],'pages/nickname.php'=>[''],'pages/newpass.php'=>[''],
        'pages/raiting.php'=>['plus','minus'],'pages/reguser.php'=>[''],'pages/key.php'=>['inkey'],'pages/link.php'=>['add'],'pages/razban.php'=>['go'],'pyramid/del.php'=>['','all'],'pyramid/admin.php'=>['settings','userset']];
}
function motor_request_route(): string {return ltrim((string)($_SERVER['SCRIPT_NAME']??''),'/');}
function motor_request_guard(): void {
    $route=motor_request_route();$method=$_SERVER['REQUEST_METHOD']??'GET';$action=$_GET['action']??'';
    $token=$_POST['uid']??$_GET['uid']??'';
    $valid=is_string($token)&&isset($_SESSION['token'])&&hash_equals($_SESSION['token'],$token);
    if($method==='POST') {
        $max=motor_media_ini_bytes_for_request(ini_get('post_max_size'));
        if($max>0 && (int)($_SERVER['CONTENT_LENGTH']??0)>$max)motor_request_reject(413,'Общий размер отправки превышает лимит сервера.');
        $origin=$_SERVER['HTTP_ORIGIN']??'';$host=strtolower($_SERVER['HTTP_HOST']??'');
        if(($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site')motor_request_reject(403,'Запрос с другого сайта отклонён.');
        if($origin!=='') {
            $parts=parse_url($origin);$authority=is_array($parts)?strtolower(($parts['host']??'').(isset($parts['port'])?':'.$parts['port']:'')):'';
            if(!$authority||!in_array($parts['scheme']??'',['http','https'],true)||!hash_equals($host,$authority))motor_request_reject(403,'Источник запроса не совпадает с сайтом.');
        }
        // Login and initial installer have their own validation; they also obey Origin/Fetch-Metadata.
        if(!($route==='INSTALL.php' || ($route==='input.php' && $action==='')) && !$valid)motor_request_reject(403,'Обновите форму и повторите действие: неверный идентификатор сессии.');
        foreach($_POST as $key=>$value) {
            if(is_array($value) && !in_array($key,['del','dirarc','id','photos','formats','remove_attachments','forum','news'],true))motor_request_reject(400,'Вместо текстового поля передан массив.');
            if(is_array($value) && !in_array($key,['forum','news'],true))foreach($value as $entry)if(!is_string($entry))motor_request_reject(400,'Некорректный список значений.');
        }
        // Old handlers read uid from the query; do not put it in new form URLs.
        if($valid && !isset($_GET['uid']))$_GET['uid']=$token;
    }
    if($route==='input.php' && $action==='exit' && $method==='GET')return;
    if((in_array($action,motor_request_actions()[$route]??[],true) || ($route==='games/hi.php' && isset($_GET['newgame']))) && $method!=='POST') {
        motor_request_reject(403,'Для этого действия отправьте форму на сайте.');
    }
}
function motor_request_html(string $html): string {
    if(!isset($_SESSION['token']) || !str_contains($html,'<'))return $html;
    foreach(headers_list() as $header)if(stripos($header,'Content-Type:')===0 && stripos($header,'text/html')===false)return $html;
    $token=htmlspecialchars($_SESSION['token'],ENT_QUOTES,'UTF-8');$hidden='<input type="hidden" name="uid" value="'.$token.'">';
    // Turn legacy game action links into actual POST buttons, retaining query arguments.
    $route=motor_request_route();
    $html=preg_replace_callback('~<a\b(?=[^>]*\bdata-motor-action\b)[^>]*href="([^"]+)"[^>]*>(.*?)</a>~is',function($m)use($route,$hidden){
        $url=html_entity_decode($m[1],ENT_QUOTES,'UTF-8');$p=parse_url($url);
        if(!$p||isset($p['host'])||isset($p['scheme']))return $m[0];
        parse_str($p['query']??'',$q);$path=$p['path']??basename($route);
        $logout=basename($path)==='input.php' && ($q['action']??'')==='exit';
        $segments=[];foreach(explode('/',str_starts_with($path,'/')?$path:dirname($route).'/'.$path) as $segment){if($segment===''||$segment==='.')continue;if($segment==='..'){array_pop($segments);continue;}$segments[]=$segment;}$target=implode('/',$segments);
        $game=(in_array($q['action']??'',motor_request_actions()[$target]??[],true) || ($target==='games/hi.php' && isset($q['newgame'])));
        if(!$logout && !$game)return $m[0];
        unset($q['uid']);$action=htmlspecialchars($path.'?'.http_build_query($q),ENT_QUOTES,'UTF-8');
        return '<form class="legacy-action" method="post" action="'.$action.'">'.$hidden.'<button type="submit">'.$m[2].'</button></form>';
    },$html);
    return preg_replace_callback('~(<form\b(?=[^>]*\bmethod\s*=\s*["\x27]?post\b)[^>]*>)(.*?)</form>~is',function($m)use($hidden){
        if(preg_match('~\bname\s*=\s*["\x27]uid["\x27]~i',$m[2]))return $m[0];
        return $m[1].$hidden.$m[2].'</form>';
    },$html);
}

function motor_media_ini_bytes_for_request(string $value): int {return (int)((float)$value*(['g'=>1073741824,'m'=>1048576,'k'=>1024][strtolower(substr($value,-1))]??1));}
