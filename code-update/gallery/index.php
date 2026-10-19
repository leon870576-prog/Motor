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
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/gallery.php';
include '../themes/'.$config['themes'].'/index.php';
show_title('gallery.gif', 'Фотогалерея');
try {
    motor_gallery_request_guard();
    $action=$_GET['action'] ?? '';
    if (!is_string($action)) throw new RuntimeException('Некорректный запрос.',400);
    $settings=motor_gallery_settings();
    $start=max(0,(int)($_GET['start'] ?? 0));
    if (in_array($action,['add','addkomm','del'],true)) {
        if (!is_user()) throw new RuntimeException('Для этого действия необходимо войти на сайт.',403);
        motor_form_guard($action==='add'?['name','msg']:($action==='del'?[]:['msg']));
        motor_gallery_lock();
    }
    if ($action==='add') {
        [$name,$msg]=motor_gallery_input();
        antiflood('Location: index.php?action=addfoto&isset=antiflood');
        karantin($udata[6], 'Location: index.php?action=addfoto&isset=karantin');
        $id=motor_gallery_upload($settings);
        try {
            $rows=motor_gallery_rows();
            $rows[]=no_br($msg.'|'.$name.'|'.$log.'||'.SITETIME.'|'.pathinfo($id,PATHINFO_FILENAME).'|'.$id.'|');
            motor_gallery_save($rows);
        } catch (Throwable $e) {motor_gallery_remove_files($id);throw $e;}
        if (($_POST['ashow'] ?? '')==='1') change_profil($log,[72=>$id]);
        header('Location: index.php?action=showimg&gid='.rawurlencode($id));exit;
    }
    if (in_array($action,['showimg','komm','addkomm','del'],true)) {
        $gid=$_GET['gid'] ?? '';$photo=motor_gallery_find($gid);
        if (!motor_gallery_visible($photo) || !is_file(DATADIR.'datagallery/'.$gid)) throw new RuntimeException('Фотография недоступна.',404);
        $commentsPath=DATADIR.'datagallery/'.$gid.'.dat';
        $commentsRaw=is_file($commentsPath)?file_get_contents($commentsPath):'';
        $comments=$commentsRaw===''?[]:array_values(array_filter(explode("\n",str_replace("\r",'',$commentsRaw)),fn($v)=>$v!==''));
    }
    if ($action==='addkomm') {
        $returnPage=$_POST['return_page']??'';
        if ($returnPage!=='') {
            require_once '../includes/userpages.php';
            if (!motor_userpage_login($returnPage) || $returnPage!==($photo['data'][2]??'')) throw new RuntimeException('Некорректная страница возврата.',400);
            motor_userpage_profile($returnPage);
        }
        $msg=trim($_POST['msg']);
        if (mb_strlen($msg)<1 || mb_strlen($msg)>2000) throw new RuntimeException('Комментарий должен содержать от 1 до 2000 символов.',400);
        antiflood('Location: index.php?action=komm&gid='.$gid.'&isset=antiflood');
        karantin($udata[6], 'Location: index.php?action=komm&gid='.$gid.'&isset=karantin');
        $comments[]=no_br(antimat(check($msg)),'<br />').'||'.SITETIME.'|'.$log.'|';
        motor_media_atomic($commentsPath,implode("\n",array_slice($comments,-$settings['comments_max']))."\n");
        statistics(7);increment_profil($log,[33=>1,36=>1,41=>1],[14=>$ip]);
        if ($returnPage!=='') {header('Location: '.motor_userpage_url($returnPage,['tab'=>'photos']).'#photo-'.rawurlencode($gid),true,303);exit;}
        header('Location: index.php?action=komm&gid='.$gid);exit;
    }
    if ($action==='del') {
        if (!motor_gallery_moderator()) throw new RuntimeException('Недостаточно прав.',403);
        motor_gallery_check_version($commentsRaw);
        $selected=$_POST['del'] ?? [];
        if (!is_array($selected) || !$selected || count($selected)>50) throw new RuntimeException('Выберите комментарии.',400);
        foreach ($selected as $i) if (!is_string($i) || !ctype_digit($i) || !isset($comments[(int)$i])) throw new RuntimeException('Некорректный выбор комментариев.',400);
        foreach ($selected as $i) unset($comments[(int)$i]);
        motor_media_atomic($commentsPath,$comments?implode("\n",array_values($comments))."\n":'');
        motor_gallery_audit('delete_comments',[$gid]);
        header('Location: index.php?action=komm&gid='.$gid);exit;
    }
    echo '<nav class="gallery-actions" aria-label="Галерея"><a href="index.php">Все фотографии</a><a href="index.php?action=addfoto">Добавить фото</a>';
    if (motor_gallery_moderator()) echo '<a href="'.ADMINDIR.'gallery.php">Управление фотографиями</a>';
    if (motor_gallery_admin()) echo '<a href="'.ADMINDIR.'gallery-settings.php">Настройки галереи</a>';
    echo '</nav>';
    if ($action==='') {
        $photos=[];
        foreach (array_reverse(motor_gallery_rows()) as $i=>$row) {
            $d=explode('|',$row);$p=['index'=>$i,'row'=>$row,'data'=>$d];
            if (motor_gallery_valid_id($d[6] ?? null) && motor_gallery_visible($p) && is_file(DATADIR.'datagallery/'.$d[6])) $photos[]=$p;
        }
        $total=count($photos);if ($start >= $total) $start=0;
        echo '<div class="gallery-grid">';
        foreach (array_slice($photos,$start,$settings['per_page']) as $p) motor_gallery_card($p);
        echo '</div>';
        if (!$total) echo '<p>Фотографий пока нет. Добавьте первую!</p>';
        else {page_jumpnavigation('index.php?', $settings['per_page'],$start,$total);page_strnavigation('index.php?', $settings['per_page'],$start,$total);echo '<p>Всего фотографий: '.$total.'</p>';}
    } elseif ($action==='addfoto') {
        if (is_user()) {
            echo '<form method="post" enctype="multipart/form-data" action="index.php?action=add" class="gallery-form">';motor_form_token();
            echo '<label>Название<input name="name" required maxlength="100"></label><label>Фотография<input type="file" name="file" required accept=".'.implode(',.',$settings['formats']).'"></label>';
            echo '<p>До '.$settings['max_mb'].' МБ, '.$settings['max_side'].' px по стороне и '.$settings['max_mp'].' Мп. Форматы: '.strtoupper(implode(', ',$settings['formats'])).'.</p><p>Оригинал сохраняется без уменьшения. На странице фото подстраивается под экран.</p>';
            echo '<label>Подпись<textarea name="msg" rows="3" maxlength="2000" data-smile-picker data-smile-scope="common"></textarea></label><label><input type="checkbox" name="ashow" value="1"> Показывать в моей анкете</label><button type="submit" class="primary">Добавить фото</button></form>';
        } else show_login('Чтобы добавить фотографию, необходимо');
    } elseif ($action==='showimg') {
        motor_gallery_card($photo,true);
        if ($settings['zoom']) echo '<p class="gallery-hint">Нажмите на фото, чтобы увеличить. В открытом просмотре можно раздвигать пальцы, перемещать изображение и пользоваться кнопками масштаба.</p>';
    } elseif ($action==='komm') {
        echo '<h2>Комментарии: <a href="index.php?action=showimg&amp;gid='.$gid.'">'.motor_gallery_escape(motor_gallery_plain($photo['data'][1])).'</a></h2>';
        if (is_user()) {
            echo '<form method="post" action="index.php?action=addkomm&amp;gid='.$gid.'">';motor_form_token();
            echo '<label>Сообщение<textarea name="msg" rows="3" required maxlength="2000" data-smile-picker></textarea></label><button type="submit" class="primary">Написать</button></form>';
        } else show_login('Чтобы оставить комментарий, необходимо');
        $total=count($comments);if ($start >= $total) $start=0;
        if (motor_gallery_moderator() && $total) {echo '<form method="post" action="index.php?action=del&amp;gid='.$gid.'">';motor_form_token();motor_gallery_version($commentsRaw);}
        foreach (array_slice(array_reverse($comments,true),$start,$settings['comments_page'],true) as $i=>$row) {
            $d=explode('|',$row);
            echo '<article class="gallery-comment"><p>';
            if (motor_gallery_moderator()) echo '<label><input type="checkbox" name="del[]" value="'.$i.'"> Выбрать комментарий</label>';
            echo '<b>'.nickname($d[3]).'</b> · '.date_fixed((int)$d[2]).'</p><div>'.motor_gallery_text($d[0]).'</div></article>';
        }
        if (motor_gallery_moderator() && $total) echo '<button type="submit" class="primary">Удалить выбранные комментарии</button></form>';
        if (!$total) echo '<p>Комментариев пока нет.</p>';
        page_jumpnavigation('index.php?action=komm&amp;gid='.$gid.'&amp;',$settings['comments_page'],$start,$total);
        page_strnavigation('index.php?action=komm&amp;gid='.$gid.'&amp;',$settings['comments_page'],$start,$total);
    } else throw new RuntimeException('Страница не найдена.',404);
} catch (Throwable $e) {motor_gallery_error($e);}
include '../themes/'.$config['themes'].'/foot.php';
