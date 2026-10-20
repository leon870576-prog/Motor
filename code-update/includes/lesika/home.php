<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }
$lesikaSections = [
    ['news/index.php','news','Новости','События, объявления и жизнь нашего портала',stats_news()],
    ['forum/index.php','forum','Форум','Вопросы, ответы и полезные советы',stats_forum()],
    ['book/index.php','guest','Гостевая','Передайте привет соседям',stats(0)],
    ['gallery/index.php','image','Фотогалерея','Наш город в ваших фотографиях',stats_gallery()],
    ['board/index.php','pin','Объявления','Найти, предложить, поделиться',stats_board()],
    ['chat/index.php','forum','Мини-чат','Разговоры по соседству',stats(8)],
];
echo '<div class="home-sections">';
foreach ($lesikaSections as [$href,$icon,$title,$description,$count]) {
    echo '<a class="section-card" href="'.BASEDIR.$href.'"><span class="section-symbol">'.lesika_icon($icon).'</span><span class="section-copy"><strong>'.$title.'</strong><small>'.$description.'</small></span><span class="section-end"><span class="count-badge">'.$count.'</span>'.lesika_icon('arrow').'</span></a>';
}
echo '</div><section class="neighbors"><h2>В нашем городе</h2><div class="neighbor-links">';
foreach (['pages/userlist.php'=>'Жители', 'pages/adminlist.php'=>'Администрация', 'votes/index.php'=>'Голосования', 'pages/index.php?action=statistik'=>'Статистика', 'pages/index.php?action=arkada'=>'Развлечения', 'pages/index.php?action=info'=>'Информация', 'pages/index.php?action=partners'=>'Партнёры', 'pages/index.php?action=buttons'=>'Наши кнопки'] as $href=>$title) {
    echo '<a href="'.BASEDIR.$href.'">'.$title.lesika_icon('arrow').'</a>';
}
echo '</div></section>';
