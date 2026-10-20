<?php
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';
require_once '../includes/home-content.php';
if (!motor_home_admin()) motor_request_reject(403,'Настройки главной страницы доступны только администраторам.');
header('Cache-Control: private, no-store');$settings=null;$error='';$block='';$query='';$page=1;
try {
    $method=$_SERVER['REQUEST_METHOD']??'GET';
    if (!in_array($method,['GET','HEAD','POST'],true)) throw new RuntimeException('Метод запроса не поддерживается.',405);
    $block=$_GET['block']??'';$query=$_GET['q']??'';
    if (!is_string($block) || ($block!=='' && !isset(motor_home_sections()[$block])) || !is_string($query) || strlen($query)>480 || !mb_check_encoding($query,'UTF-8') || mb_strlen($query)>120) throw new InvalidArgumentException('Неверные параметры поиска.');
    $page=motor_home_integer($_GET['page']??'1',1,999);
    if ($method==='POST') {
        motor_home_save($_POST);
        header('Location: home-settings.php?'.http_build_query(['block'=>$block,'q'=>$query,'page'=>$page,'saved'=>'1']).($block!==''?'#home-picker':''),true,303);exit;
    }
    $settings=motor_home_settings();
} catch(Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException?400:(in_array($e->getCode(),[403,405,409],true)?$e->getCode():503));
    $error=$e instanceof RuntimeException || $e instanceof InvalidArgumentException?$e->getMessage():'Не удалось выполнить действие.';
    if (!is_string($block) || !isset(motor_home_sections()[$block])) $block='';
    if (!is_string($query)) $query='';
    try {$settings=motor_home_settings();}catch(Throwable $ignored){}
}
include '../themes/'.$config['themes'].'/index.php';show_title('menu.gif','Главная страница: блоки и записи');
$h='motor_home_escape';
require_once BASEDIR.'includes/home-template.php';
echo '<nav class="home-editor-nav"><a href="../index.php">Посмотреть главную</a>';
if (motor_home_template_owner()) echo '<a href="files.php?action=edit&amp;file=index.dat">Шаблон карточек и ссылок</a>';
echo '<a href="../pages/themes.php">Оформление</a></nav>';
if ($error!=='') echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if (($_GET['saved']??'')==='1' && $error==='') echo '<p class="theme-success" role="status">Настройки сохранены.</p>';
echo '<p>Задайте количество записей, режим и порядок блоков. 0 скрывает блок. В режиме «Выбранные» показываются только добавленные вами записи, в заданном порядке, не больше указанного количества.</p>';
echo '<p>Фото и видео включаются отдельно для каждого блока. У новости и темы форума показываются до одного фото и одного видео; у объявления — первое фото. Видео запускается только по нажатию. Галерея содержит только фотографии: отключение фото скрывает этот блок. Мини-чат и гостевая остаются текстовыми — загрузки медиа в них нет.</p>';
if ($settings!==null) {
    $version=motor_home_version($settings);$catalog=[];
    foreach (motor_home_sections() as $kind=>$label) $catalog[$kind]=motor_home_catalog($kind);
    echo '<form class="home-settings-form" method="post" action="home-settings.php">';motor_form_token();
    echo '<input type="hidden" name="operation" value="settings"><input type="hidden" name="version" value="'.$version.'">';
    foreach ($settings['order'] as $position=>$kind) {
        [$label,$href]=motor_home_sections()[$kind];$b=$settings['blocks'][$kind];$map=array_column($catalog[$kind],null,'id');
        echo '<fieldset class="home-settings-block"><legend>'.$label.'</legend><div class="home-settings-fields">';
        echo '<label>Порядок блока<input type="number" inputmode="numeric" min="1" max="6" required name="position_'.$kind.'" value="'.($position+1).'"></label>';
        echo '<label>Количество записей<input type="number" inputmode="numeric" min="0" max="20" required name="count_'.$kind.'" value="'.$b['count'].'"></label>';
        echo '<label>Режим<select name="mode_'.$kind.'">';
        foreach (['latest'=>'Последние — сначала новые','oldest'=>'Сначала старые','selected'=>'Выбранные — мой порядок'] as $value=>$text) echo '<option value="'.$value.'"'.($value===$b['mode']?' selected':'').'>'.$text.'</option>';
        echo '</select></label>';
        foreach (['photos'=>'Фото на главной','videos'=>'Видео на главной'] as $media=>$caption) {
            echo '<label>'.$caption.'<select name="'.$media.'_'.$kind.'">';
            foreach (['1'=>'Показывать','0'=>'Не показывать'] as $value=>$text) echo '<option value="'.$value.'"'.((bool)(int)$value===$b[$media]?' selected':'').'>'.$text.'</option>';
            echo '</select></label>';
        }
        if ($kind==='gallery') foreach (['width'=>'Ширина фото, px','height'=>'Высота фото, px'] as $side=>$caption) echo '<label>'.$caption.'<input type="number" inputmode="numeric" min="80" max="480" required name="gallery_'.$side.'" value="'.$settings['gallery_size'][$side].'"></label>';
        echo '</div>';
        if ($kind==='gallery') echo '<p>Размер от 80 до 480 px. По умолчанию 120 × 128 px. Превью заполняют ячейки без промежутков и переносятся на следующую строку; края снимка могут обрезаться. Полное фото открывается по нажатию. Ширина уменьшается, если экран уже заданного размера. Видеофайлы в галерее не загружаются.</p>';
        if ($kind==='board') echo '<p>В объявлениях доступны фотографии; загрузка видео не поддерживается.</p>';
        if ($kind==='forum') echo '<p>Предпросмотр берётся из вложений первого сообщения темы.</p>';
        if ($b['selected']) {
            echo '<ol class="home-selection">';
            foreach ($b['selected'] as $i=>$id) {
                $item=$map[$id]??null;
                echo '<li><div>'.($item?'<a href="'.$h(BASEDIR.$item['url']).'">'.$h($item['title']?:$item['text']).'</a><small> · '.$h(motor_home_plain($item['author'],60)).' · '.$h(date_fixed($item['time'])).'</small>':'<span>Запись удалена, скрыта, изменена или срок показа истёк. На главной не показывается.</span>').'</div>';
                echo '<label>Порядок записи<input type="number" inputmode="numeric" min="1" max="20" required name="rank_'.$kind.'_'.$i.'" value="'.($i+1).'"></label>';
                echo '<label><input type="checkbox" name="remove_'.$kind.'_'.$i.'" value="1"> Убрать из подборки</label></li>';
            }
            echo '</ol>';
        } else echo '<p>В ручной подборке пока нет записей.</p>';
        echo '<a class="home-open" href="home-settings.php?block='.$kind.'#home-picker">Выбрать записи: '.$label.'</a></fieldset>';
    }
    echo '<p>Перед переходом к выбору записей сохраните изменённые количества и порядок. Добавление записи сразу включает режим «Выбранные» для её блока. Если выбранных записей больше лимита, остальные остаются в подборке.</p><button class="primary" type="submit">Сохранить настройки главной</button></form>';
    if ($block!=='') {
        $matches=array_values(array_filter($catalog[$block],fn($item)=>$query==='' || mb_stripos($item['title'].' '.$item['text'].' '.$item['author'].' '.$item['detail'],$query)!==false));
        $total=count($matches);$pages=max(1,min(999,(int)ceil($total/20)));$page=min($page,$pages);
        $url='home-settings.php?'.http_build_query(['block'=>$block,'q'=>$query,'page'=>$page]);
        echo '<section id="home-picker" class="home-picker"><h2>Выбрать записи: '.motor_home_sections()[$block][0].'</h2><p>Здесь только доступные записи. Скрытые фото и просроченные объявления не предлагаются.</p>';
        echo '<form method="get" action="home-settings.php#home-picker"><input type="hidden" name="block" value="'.$block.'"><label>Поиск по названию, тексту или автору<input type="search" name="q" maxlength="120" value="'.$h($query).'"></label><button type="submit">Найти</button></form><p>Найдено: '.$total.'. Страница '.$page.' из '.$pages.'.</p>';
        foreach (array_slice($matches,($page-1)*20,20) as $item) {
            echo '<div class="home-picker-row">';motor_home_item($item,$block);
            if (in_array($item['id'],$settings['blocks'][$block]['selected'],true)) echo '<p>Уже в подборке</p>';
            else {
                echo '<form method="post" action="'.$h($url).'">';motor_form_token();
                echo '<input type="hidden" name="operation" value="select"><input type="hidden" name="version" value="'.$version.'"><input type="hidden" name="block" value="'.$block.'"><input type="hidden" name="record" value="'.$h($item['id']).'"><button type="submit"'.(count($settings['blocks'][$block]['selected'])>=20?' disabled':'').'>Добавить в подборку</button></form>';
            }
            echo '</div>';
        }
        if (!$matches) echo '<p>Подходящих записей нет.</p>';
        echo '<nav class="home-picker-pages" aria-label="Страницы выбора записей">';
        foreach ([$page-1=>'← Назад',$page+1=>'Далее →'] as $n=>$label) if ($n>=1 && $n<=$pages) echo '<a href="'.$h('home-settings.php?'.http_build_query(['block'=>$block,'q'=>$query,'page'=>$n]).'#home-picker').'">'.$label.'</a>';
        echo '</nav></section>';
    }
}
echo '<p><a href="../index.php">Посмотреть главную</a> · <a href="index.php">Панель управления</a></p>';
include '../themes/'.$config['themes'].'/foot.php';
