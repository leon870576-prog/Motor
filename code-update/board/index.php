<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/board.php';
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Доска объявлений');
try {
    $action=$_GET['action']??'';
    if($action===''){
        foreach(motor_board_categories() as $row){$d=explode('|',$row);$id=motor_board_number($d[2]);$rows=motor_board_prune($id);
            echo '<div class="b"><b><a href="index.php?action=board&amp;id='.$id.'">'.motor_board_label($d[0]).'</a></b> ('.count($rows).')</div><div>'.motor_board_label($d[1]).'</div>';
        }
        if(!motor_board_categories())echo '<p>Рубрики ещё не созданы.</p>';
    } elseif(in_array($action,['board','view'],true)){
        $id=motor_board_number($_GET['id']??'');$cat=motor_board_category($id);if(!$cat)throw new RuntimeException('Рубрика не найдена.',404);
        echo '<nav><a class="touch-link" href="index.php">Все рубрики</a> · <a class="touch-link" href="add.php?id='.$id.'">Добавить объявление</a>';
        if(motor_board_staff())echo ' · <a class="touch-link" href="../mpanel/board.php?action=board&amp;id='.$id.'">Управление</a>';
        echo '</nav><h2>'.motor_board_label($cat['data'][0]).'</h2>';
        $rows=motor_board_prune($id);
        if($action==='view'){$record=motor_board_find($id,motor_board_number($_GET['bid']??''));if(!$record)throw new RuntimeException('Объявление не найдено или срок показа истёк.',404);motor_board_card($record['data'],true);}
        else {
            $rows=array_reverse(array_values($rows));$total=count($rows);$start=max(0,(int)($_GET['start']??0));if($start>=$total)$start=0;$per=max(1,min(50,(int)$config['boardspost']));
            foreach(array_slice($rows,$start,$per) as $row)motor_board_card(array_pad(explode('|',$row),8,''));
            if(!$total)echo '<p>Объявлений пока нет.</p>';
            page_jumpnavigation('index.php?action=board&amp;id='.$id.'&amp;',$per,$start,$total);page_strnavigation('index.php?action=board&amp;id='.$id.'&amp;',$per,$start,$total);
        }
    } else throw new RuntimeException('Страница не найдена.',404);
} catch(Throwable $e){motor_board_error($e);}
echo '<p><a href="../index.php">На главную</a></p>';include '../themes/'.$config['themes'].'/foot.php';
