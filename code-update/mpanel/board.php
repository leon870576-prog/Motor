<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/board.php';
if(!motor_board_staff()){http_response_code(403);exit('Недостаточно прав.');}
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Управление объявлениями');
try {
    motor_media_request_guard();$action=$_GET['action']??'';$administrator=is_admin([101,102]);$catalog=DATADIR.'databoard/database.dat';
    if(in_array($action,['addrub','addedit','move','delrub','deltop'],true)) {
        motor_form_guard([]);motor_media_lock();
        if($action!=='deltop' && !$administrator)throw new RuntimeException('Рубриками управляют только администраторы.',403);
        if($action==='deltop') {
            $id=motor_board_number($_GET['id']??'');if(!motor_board_category($id))throw new RuntimeException('Рубрика удалена.',404);
            $path=motor_board_path($id);$rows=motor_board_rows($path);motor_media_check_version(implode("\n",$rows));
            $selected=motor_board_selected();$removed=[];
            foreach($rows as $i=>$row){$d=explode('|',$row);if(in_array((int)$d[5],$selected,true)){$removed[]=$d;unset($rows[$i]);}}
            if(count($removed)!==count($selected))throw new RuntimeException('Список объявлений изменился. Обновите страницу.',409);
            motor_board_save_rows($path,$rows);foreach($removed as $d)motor_media_delete('board',motor_board_parent($d));
            header('Location: board.php?action=board&id='.$id);exit;
        }
        $rows=motor_board_categories();
        if($action==='addrub' || $action==='addedit') {
            motor_form_guard(['zag','msg']);$title=no_br(check(trim($_POST['zag'])));$description=no_br(check(trim($_POST['msg'])));
            if(utf_strlen($title)<3 || utf_strlen($title)>50 || utf_strlen($description)<5 || utf_strlen($description)>100)throw new RuntimeException('Название: 3–50 символов, описание: 5–100.',400);
            if($action==='addrub'){$id=unifile($catalog,2);$rows[]=implode('|',[$title,$description,$id,'']);}
            else {$id=motor_board_number($_GET['id']??'');$category=motor_board_category($id);if(!$category)throw new RuntimeException('Рубрика удалена.',404);motor_media_check_version($category['row']);$rows[$category['index']]=implode('|',[$title,$description,$id,'']);}
            motor_board_save_rows($catalog,$rows);
        } elseif($action==='move') {
            motor_media_check_version(implode("\n",$rows));$id=motor_board_number($_GET['id']??'');$where=$_POST['where']??'';
            if(!in_array($where,['up','down'],true))throw new RuntimeException('Неверное направление.',400);
            $rows=array_values($rows);$index=null;foreach($rows as $i=>$row)if(explode('|',$row)[2]===(string)$id)$index=$i;
            if($index===null)throw new RuntimeException('Рубрика удалена.',404);$other=$index+($where==='up'?-1:1);
            if(isset($rows[$other])){[$rows[$other],$rows[$index]]=[$rows[$index],$rows[$other]];motor_board_save_rows($catalog,$rows);}
        } elseif($action==='delrub') {
            motor_media_check_version(implode("\n",$rows));$selected=motor_board_selected();$removed=[];
            foreach($rows as $i=>$row){$d=explode('|',$row);if(in_array((int)$d[2],$selected,true)){$removed[]=(int)$d[2];unset($rows[$i]);}}
            if(count($removed)!==count($selected))throw new RuntimeException('Список рубрик изменился. Обновите страницу.',409);
            // Remove the catalog entry first, so photos cannot be served during cleanup.
            motor_board_save_rows($catalog,$rows);
            foreach($removed as $id){$path=motor_board_path($id);foreach(motor_board_rows($path) as $row)motor_media_delete('board',motor_board_parent(explode('|',$row)));if(is_file($path) && !unlink($path))throw new RuntimeException('Не удалось удалить файл рубрики.',500);}
        }
        header('Location: board.php');exit;
    }
    if($action==='add' || $action==='edit') {
        if(!$administrator)throw new RuntimeException('Рубриками управляют только администраторы.',403);
        $cat=null;if($action==='edit'){$id=motor_board_number($_GET['id']??'');$cat=motor_board_category($id);if(!$cat)throw new RuntimeException('Рубрика не найдена.',404);}
        echo '<h2>'.($cat?'Редактирование':'Добавление').' рубрики</h2><form method="post" action="board.php?action='.($cat?'addedit&amp;id='.$id:'addrub').'">';motor_form_token();if($cat)motor_media_version($cat['row']);
        echo '<label>Название<input name="zag" required minlength="3" maxlength="50" value="'.motor_board_label($cat['data'][0]??'').'"></label><label>Описание<input name="msg" required minlength="5" maxlength="100" value="'.motor_board_label($cat['data'][1]??'').'"></label><button type="submit">Сохранить рубрику</button></form>';
    } elseif($action==='board') {
        $id=motor_board_number($_GET['id']??'');$cat=motor_board_category($id);if(!$cat)throw new RuntimeException('Рубрика не найдена.',404);
        $rows=motor_board_prune($id);$total=count($rows);$per=max(1,min(50,(int)$config['boardspost']));$start=max(0,(int)($_GET['start']??0));if($start>=$total)$start=0;
        echo '<h2>'.motor_board_label($cat['data'][0]).'</h2><p><a href="../board/add.php?id='.$id.'">Добавить объявление</a> · <a href="../board/index.php?action=board&amp;id='.$id.'">Обзор</a></p>';
        echo '<form method="post" action="board.php?action=deltop&amp;id='.$id.'">';motor_form_token();motor_media_version(implode("\n",$rows));
        foreach(array_slice(array_reverse(array_values($rows)),$start,$per) as $row){$d=array_pad(explode('|',$row),8,'');echo '<label><input type="checkbox" name="del[]" value="'.motor_board_number($d[5]).'"> Выбрать объявление</label>';motor_board_card($d,true);}
        if($total)echo '<button type="submit">Удалить выбранные объявления и их фото</button>';else echo '<p>Объявлений пока нет.</p>';echo '</form>';
        page_jumpnavigation('board.php?action=board&amp;id='.$id.'&amp;',$per,$start,$total);page_strnavigation('board.php?action=board&amp;id='.$id.'&amp;',$per,$start,$total);
    } elseif($action==='') {
        $rows=motor_board_categories();$version=implode("\n",$rows);
        if($administrator){echo '<p><a href="board-settings.php">Настройки фотографий</a> · <a href="board.php?action=add">Добавить рубрику</a></p><form id="delete-categories" method="post" action="board.php?action=delrub">';motor_form_token();motor_media_version($version);echo '</form>';}
        foreach($rows as $row){$d=explode('|',$row);$id=motor_board_number($d[2]);echo '<div class="b"><a href="board.php?action=board&amp;id='.$id.'">'.motor_board_label($d[0]).'</a> ('.count(motor_board_prune($id)).')</div><p>'.motor_board_label($d[1]).'</p>';
            if($administrator){echo '<label><input form="delete-categories" type="checkbox" name="del[]" value="'.$id.'"> Выбрать рубрику</label><a href="board.php?action=edit&amp;id='.$id.'">Редактировать рубрику</a><form method="post" action="board.php?action=move&amp;id='.$id.'">';motor_form_token();motor_media_version($version);echo '<button name="where" value="up">Вверх</button><button name="where" value="down">Вниз</button></form>';}
        }
        if($administrator && $rows)echo '<button form="delete-categories" type="submit">Удалить выбранные рубрики с объявлениями и фото</button>';
        if(!$rows)echo '<p>Рубрики ещё не созданы.</p>';
    } else throw new RuntimeException('Действие не найдено.',404);
} catch(Throwable $e){motor_board_error($e);}
echo '<p><a href="board.php">Управление объявлениями</a> · <a href="index.php">В админку</a></p>';include '../themes/'.$config['themes'].'/foot.php';
