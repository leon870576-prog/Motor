<?php
#-----------------------------------------------------#
#          ********* WAP-MOTORS *********             #
#              Made by  :  VANTUZ                     #
#               E-mail  :  visavi.net@mail.ru         #
#                 Site  :  http://pizdec.ru           #
#             WAP-Site  :  http://visavi.net          #
#                  ICQ  :  36-44-66                   #
#  Вы не имеете право вносить изменения в код скрипта #
#        для его дальнейшего распространения          #
#-----------------------------------------------------#
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';
require_once '../includes/dat-pages.php';
if (!motor_home_template_owner()) {header('Location: ../index.php?isset=404',true,302);exit;}
header('Cache-Control: private, no-store');
$action=$_GET['action']??'';$file=$_GET['file']??'';$error='';$state=null;$draft=null;
if (!is_string($action)||!is_string($file)) motor_request_reject(400,'Неверные параметры редактора.');
if ($file==='index.dat' && in_array($action,['edit','obzor','editfile'],true)) {
    include '../themes/'.$config['themes'].'/index.php';show_title('menu.gif','Редактирование страниц');
    include BASEDIR.'includes/home-template-editor.php';include '../themes/'.$config['themes'].'/foot.php';exit;
}
try {
    if (!in_array($action,['','edit','obzor','editfile','new','addnew','poddel','del','faq'],true)) throw new InvalidArgumentException('Неизвестное действие.');
    if (in_array($action,['editfile','addnew','del'],true)) {
        if ($action==='addnew') {
            $name=$_POST['newfile']??null;if(!is_string($name)||!preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$name)) throw new InvalidArgumentException('Название: 1–64 латинские буквы, цифры, дефис или подчёркивание.');
            $file=$name.'.dat';
        }
        motor_dat_change($file,['editfile'=>'save','addnew'=>'create','del'=>'delete'][$action],$_POST);
        header('Location: '.($action==='del'?'files.php?deleted=1':'files.php?action=edit&file='.rawurlencode($file).'&saved=1'),true,303);exit;
    }
    if (in_array($action,['edit','obzor','poddel'],true)) $state=motor_dat_state($file);
} catch(Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException?400:(in_array($e->getCode(),[403,404,409],true)?$e->getCode():503));
    $error=$e instanceof RuntimeException||$e instanceof InvalidArgumentException?$e->getMessage():'Не удалось выполнить действие.';
    if ($action==='editfile') {if(isset($_POST['msg'])&&is_string($_POST['msg'])&&strlen($_POST['msg'])<=262144)$draft=$_POST['msg'];$action='edit';}
    if ($action==='addnew') $action='new';
    try {if(in_array($action,['edit','obzor','poddel','del'],true))$state=motor_dat_state($file);} catch(Throwable $ignored){}
}
include '../themes/'.$config['themes'].'/index.php';show_title('menu.gif','Редактирование файлов');$h='motor_dat_escape';
echo '<section class="dat-files"><nav class="home-editor-nav"><a href="files.php">Все .dat-страницы</a><a href="home-settings.php">Блоки главной</a><a href="files.php?action=new">Создать страницу</a></nav>';
if($error!=='')echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if($error===''&&($_GET['saved']??'')==='1')echo '<p class="theme-success" role="status">Сохранено. Страница использует обновлённый файл в текущей теме сайта.</p>';
if($error===''&&($_GET['deleted']??'')==='1')echo '<p class="theme-success" role="status">Дополнительная страница удалена. Резервная копия сохранена.</p>';
if($action==='') {
    echo '<p>Файлы задают содержимое страниц и рекламных блоков. Общая шапка, подвал, цвета и размеры берутся из действующей темы. «На сайте» открывает настоящее место вывода; «Исходник» показывает тот же код, что использует сайт.</p>';
    $files=[];foreach(glob(DATADIR.'datamain/*.dat')?:[] as $path)if(preg_match('/^[a-zA-Z0-9_-]{1,64}\.dat$/D',basename($path)))$files[]=basename($path);
    sort($files);$total=count($files);$per=max(1,min(100,(int)$config['editfiles']));$start=filter_var($_GET['start']??0,FILTER_VALIDATE_INT);if($start===false||$start<0||$start>=$total)$start=0;
    foreach(array_slice($files,$start,$per) as $name){
        echo '<article class="dat-file-card" data-dat-file="'.$h($name).'">';
        try {$s=motor_dat_state($name);[$title,$url,$where]=motor_dat_info($name);
            echo '<h2>'.$h($title).' <small>'.$h($name).'</small></h2><p>'.$h($where).'</p>';
            if(in_array($name,['reklama_head.dat','reklama_foot.dat'],true))echo '<p>Показ '.((int)$config[$name==='reklama_head.dat'?'rekhead':'rekfoot']===1?'включён':'выключен').'. <a href="setting.php?action=setsix">Настройки рекламы</a>.</p>';
            echo '<nav class="home-editor-nav"><a href="files.php?action=edit&amp;file='.$h($name).'">Редактировать</a><a href="'.$h(BASEDIR.$url).'">На сайте</a><a href="files.php?action=obzor&amp;file='.$h($name).'">Исходник</a>';
            if(!isset(motor_dat_catalog()[$name]))echo '<a href="files.php?action=poddel&amp;file='.$h($name).'">Удалить</a>';
            echo '</nav><p class="home-meta">'.$h(formatsize(strlen($s['contents']))).' · Строчек: '.(substr_count($s['contents'],"\n")+1).'</p>';
        }catch(Throwable $e){echo '<h2>'.$h($name).'</h2><p class="notice-error">Файл недоступен. Проверьте его тип, размер и права.</p>';}
        echo '</article>';
    }
    page_jumpnavigation('files.php?',$per,$start,$total);page_strnavigation('files.php?',$per,$start,$total);echo '<p>Всего файлов: '.$total.'</p>';
} elseif(in_array($action,['edit','obzor','poddel','del'],true)&&$state!==null){
    [$title,$url,$where]=motor_dat_info($file);echo '<h2>'.$h($title).'</h2><p><code>'.$h($file).'</code> — '.$h($where).'. <a href="'.$h(BASEDIR.$url).'">Посмотреть на сайте</a></p>';
    if(in_array($file,['reklama_head.dat','reklama_foot.dat'],true))echo '<p>Показ '.((int)$config[$file==='reklama_head.dat'?'rekhead':'rekfoot']===1?'включён':'выключен').'. Пустой файл ничего не добавляет. <a href="setting.php?action=setsix">Настройки рекламы</a>.</p>';
    echo '<p>Шапка, подвал и оформление подключаются самой страницей; добавлять их в этот файл не нужно. Сохраняются точные символы HTML и PHP. Строчек: '.(substr_count($state['contents'],"\n")+1).'.</p>';
    if(in_array($action,['poddel','del'],true)){
        if(isset(motor_dat_catalog()[$file]))echo '<p>Это системная страница: доступно редактирование или очистка содержимого.</p>';
        else {echo '<p>Удалить эту дополнительную страницу? Ссылки на неё потребуется убрать. Исходник сохранится в резервной копии.</p><form method="post" action="files.php?action=del&amp;file='.$h($file).'">';motor_form_token();echo '<input type="hidden" name="version" value="'.$state['version'].'"><button type="submit">Удалить страницу</button></form>';}
    } else {
        $version=$error!==''&&isset($_POST['version'])&&is_string($_POST['version'])&&preg_match('/^[a-f0-9]{64}$/D',$_POST['version'])?$_POST['version']:$state['version'];
        echo '<form class="home-template-form" method="post" action="files.php?action=editfile&amp;file='.$h($file).'">';motor_form_token();echo '<input type="hidden" name="version" value="'.$version.'"><label for="dat-source">HTML и PHP страницы</label><textarea id="dat-source" name="msg" rows="22" spellcheck="false" autocapitalize="off">'."\n".$h($draft??$state['contents']).'</textarea><p>Перед сохранением проверяется синтаксис PHP и создаётся резервная копия. Устаревшая форма не перезапишет свежие изменения.</p><button class="primary" type="submit">Сохранить страницу</button></form>';
    }
} elseif($action==='new') {
    echo '<h2>Новая страница</h2><form method="post" action="files.php?action=addnew">';motor_form_token();echo '<label>Имя без .dat<input name="newfile" required maxlength="64" pattern="[a-zA-Z0-9_-]+"></label><p>Латинские буквы, цифры, дефис или подчёркивание. Страница автоматически использует выбранную тему сайта.</p><button class="primary" type="submit">Создать страницу</button></form>';
} elseif($action==='faq')echo '<p>Откройте нужную страницу, измените HTML/PHP, сохраните и нажмите «Посмотреть на сайте». Цвета и оформление наследуются от выбранной темы. Файлы рекламы показываются только при включении соответствующей настройки.</p>';
echo '<p><a href="index.php">В админку</a> · <a href="../index.php">На главную</a></p></section>';
include '../themes/'.$config['themes'].'/foot.php';
