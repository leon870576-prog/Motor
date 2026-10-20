<?php
if (!defined('BASEDIR') || !motor_home_template_owner()) {http_response_code(403);exit;}
header('Cache-Control: private, no-store');
$homeState=null;$homeError='';$homeDraft=null;
try {
    if ($action==='editfile') {
        motor_home_template_save($_POST);
        header('Location: files.php?action=edit&file=index.dat&saved=1',true,303);exit;
    }
    if (!in_array($action,['edit','obzor'],true)) throw new InvalidArgumentException('Используйте редактор шаблона главной страницы.');
    $homeState=motor_home_template_state();
} catch(Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException?400:(in_array($e->getCode(),[403,409],true)?$e->getCode():503));
    $homeError=$e instanceof RuntimeException || $e instanceof InvalidArgumentException?$e->getMessage():'Не удалось открыть шаблон.';
    if (isset($_POST['msg']) && is_string($_POST['msg']) && strlen($_POST['msg'])<=262144) $homeDraft=$_POST['msg'];
    try {$homeState=motor_home_template_state();}catch(Throwable $ignored){}
}
$homeEscape=static fn($value)=>htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
echo '<section class="home-template-editor"><h2>Главная страница: шаблон разделов</h2>';
echo '<nav class="home-editor-nav"><a href="home-settings.php">Блоки и записи</a><a href="../index.php">Посмотреть главную</a><a href="files.php">Другие страницы</a></nav>';
echo '<p>Здесь открыт тот же шаблон карточек разделов и ссылок «В нашем городе», который используется на главной. Сохранение без изменений не меняет оформление.</p>';
echo '<p>Новости, фото, форум, объявления, мини-чат и гостевая над карточками настраиваются в разделе <a href="home-settings.php">«Блоки и записи»</a>: количество, порядок, подборки и медиа. Шапка и подвал общие для сайта. <a href="../pages/themes.php">Выбрать тему оформления</a>.</p>';
echo '<details class="home-template-help"><summary>Где находятся файлы главной страницы</summary><ul><li><code>index.php</code> собирает страницу.</li><li><code>local/datamain/index.dat</code> хранит сохранённый шаблон разделов. До первого сохранения стандартной главной редактор и сайт используют <code>includes/lesika/home.php</code>.</li><li><code>local/home-settings.json</code> хранит порядок и настройки блоков; выводит их <code>includes/home-content.php</code>.</li><li><code>assets/lesika/home.css</code> задаёт оформление ленты, <code>assets/lesika/site.css</code> — карточек и общих элементов; <code>responsive.css</code>, <code>compact.css</code> и <code>palettes.css</code> дополняют выбранную тему.</li></ul></details>';
if ($homeError!=='') echo '<p class="notice-error" role="alert">'.$homeEscape($homeError).'</p>';
if (($_GET['saved']??'')==='1' && $homeError==='') echo '<p class="theme-success" role="status">Шаблон сохранён. Изменения уже применены к главной странице.</p>';
if ($homeState!==null) {
    echo '<p>Шаблон: <strong>'.($homeState['builtin']?'стандартный':'сохранённый владельцем').'</strong>. Строчек: '.(substr_count($homeState['contents'],"\n")+1).'.</p>';
    echo '<form class="home-template-form" method="post" action="files.php?action=editfile&amp;file=index.dat">';motor_form_token();
    // Keep an old form stale after a conflict instead of authorizing an accidental retry.
    $homeVersion=$homeError!=='' && isset($_POST['version']) && is_string($_POST['version'])?$_POST['version']:$homeState['version'];
    echo '<input type="hidden" name="version" value="'.$homeEscape($homeVersion).'"><input type="hidden" name="operation" value="save">';
    echo '<label for="home-template-source">HTML и PHP шаблона разделов</label><textarea id="home-template-source" name="msg" rows="24" spellcheck="false" autocapitalize="off" autocomplete="off">'.$homeEscape($homeDraft??$homeState['contents']).'</textarea>';
    echo '<p>Проверяется синтаксис PHP. Перед заменой сохраняется резервная копия. Старое окно редактора не сможет перезаписать более свежую версию.</p><button class="primary" type="submit">Сохранить шаблон главной</button></form>';
    echo '<details class="home-template-reset"><summary>Восстановить стандартный шаблон разделов</summary><p>Будут возвращены стандартные карточки и ссылки. Настройки блоков и записи сохранятся. Текущий шаблон будет сохранён в резервной копии.</p><form method="post" action="files.php?action=editfile&amp;file=index.dat">';motor_form_token();
    echo '<input type="hidden" name="version" value="'.$homeEscape($homeState['version']).'"><input type="hidden" name="operation" value="standard"><button type="submit">Восстановить стандартный шаблон</button></form></details>';
}
echo '</section>';
