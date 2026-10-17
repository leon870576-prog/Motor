<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }

$cal_den = (int)date_fixed(SITETIME, 'j');
$cal_mon = (int)date_fixed(SITETIME, 'm');
$cal_year = (int)date_fixed(SITETIME, 'Y');
$cal_monyear = date_fixed(SITETIME, 'm.Y');
$array_komm = [];
$newsfile = is_readable(DATADIR.'news.dat') ? file(DATADIR.'news.dat', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];
foreach ($newsfile ?: [] as $newsvalue) {
    $ndata = explode('|', $newsvalue);
    $timestamp = filter_var($ndata[3] ?? null, FILTER_VALIDATE_INT);
    $newsId = filter_var($ndata[5] ?? null, FILTER_VALIDATE_INT);
    if ($timestamp === false || $timestamp < 0 || $newsId === false || $newsId < 0) continue;
    if (date_fixed($timestamp, 'm.Y') === $cal_monyear) {
        $array_komm[(int)date_fixed($timestamp, 'j')] = $newsId;
    }
}

echo '<table class="news-calendar"><caption><b>'.htmlspecialchars(date_fixed(SITETIME, 'j F Y'), ENT_QUOTES, 'UTF-8').'</b></caption>';
echo '<thead><tr><th scope="col">Пн</th><th scope="col">Вт</th><th scope="col">Ср</th><th scope="col">Чт</th><th scope="col">Пт</th><th scope="col">Сб</th><th scope="col">Вс</th></tr></thead><tbody>';
foreach (makeCal($cal_mon, $cal_year) as $valned) {
    echo '<tr>';
    foreach ($valned as $keyday => $valday) {
        if ($valday === '') { echo '<td></td>'; continue; }
        $today = $cal_den === $valday;
        $hasNews = array_key_exists($valday, $array_komm);
        $class = 'calendar-day'.($today ? ' calendar-today' : '').($hasNews ? ' calendar-has-news' : '');
        $current = $today ? ' aria-current="date"' : '';
        $number = '<span class="calendar-day-number">'.$valday.'</span>';
        echo '<td'.($keyday >= 5 ? ' class="calendar-weekend"' : '').'>';
        if ($hasNews) {
            $href = BASEDIR.'news/komm.php?id='.$array_komm[$valday].(SID !== '' ? '&'.SID : '');
            $label = ($today ? 'Сегодня, ' : '').$valday.'.'.$cal_mon.'.'.$cal_year.' — открыть новость';
            echo '<a class="'.$class.'" href="'.htmlspecialchars($href, ENT_QUOTES, 'UTF-8').'" aria-label="'.htmlspecialchars($label, ENT_QUOTES, 'UTF-8').'"'.$current.'>'.$number.'</a>';
        } else {
            echo '<span class="'.$class.'"'.$current.'>'.$number.'</span>';
        }
        echo '</td>';
    }
    echo '</tr>';
}
echo '</tbody></table>';
