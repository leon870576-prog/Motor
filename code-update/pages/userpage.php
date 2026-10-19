<?php
require_once '../includes/start.php';
require_once '../includes/functions.php';
require_once '../includes/header.php';
require_once '../includes/userpages.php';
require_once '../includes/reputation.php';
include '../themes/'.$config['themes'].'/index.php';

function up_h($value): string {return motor_gallery_escape($value);}
function up_link(string $owner,array $q=[]): string {return up_h(motor_userpage_url($owner,$q));}
function up_hidden(string $name,$value): void {echo '<input type="hidden" name="'.up_h($name).'" value="'.up_h($value).'">';}
function up_start_form(string $owner,string $action): void {
    echo '<form class="up-form" method="post" action="'.up_link($owner,['action'=>$action]).'">';motor_form_token();
}
function up_pager(string $owner,string $tab,int $page,int $total,int $size): void {
    if ($total<=$size) return;
    echo '<nav class="up-actions" aria-label="Страницы раздела">';
    if ($page>1) echo '<a class="touch-link" href="'.up_link($owner,['tab'=>$tab,'page'=>$page-1]).'">← Предыдущая</a>';
    echo '<span>Страница '.$page.' из '.(int)ceil($total/$size).'</span>';
    if ($page*$size<$total) echo '<a class="touch-link" href="'.up_link($owner,['tab'=>$tab,'page'=>$page+1]).'">Следующая →</a>';
    echo '</nav>';
}
function up_editor(string $owner,string $kind,?array $entry=null): void {
    $news=$kind==='news';$action=$kind.'_'.($entry?'edit':'add');
    up_start_form($owner,$action);up_hidden('id',$entry['id']??bin2hex(random_bytes(16)));
    if ($entry) up_hidden('revision',$entry['revision']);
    if ($news) echo '<label>Заголовок новости<input name="title" maxlength="100" required value="'.up_h($entry['title']??'').'"></label>';
    echo '<label>'.($news?'Текст новости':'Ваш отзыв').'<textarea name="msg" rows="'.($news?6:3).'" maxlength="'.($news?8000:2000).'" required data-smile-picker data-smile-scope="common">'.up_h($entry['text']??'').'</textarea></label>';
    echo '<button type="submit" class="primary">'.($entry?'Сохранить изменения':($news?'Опубликовать новость':'Оставить отзыв')).'</button></form>';
}
function up_record(string $owner,string $kind,array $e,bool $self,bool $staff,string $actor): void {
    $news=$kind==='news';$tab=$news?'news':'guestbook';
    $canEdit=$news?$self:($actor!=='' && $e['author']===$actor);
    $canDelete=$actor!=='' && ($self || $staff || !$news && $e['author']===$actor);
    echo '<article class="up-record" id="'.$kind.'-'.$e['id'].'">';
    if ($news) echo '<h3><a href="'.up_link($owner,['tab'=>'news','post'=>$e['id']]).'">'.up_h($e['title']).'</a></h3>';
    echo '<p class="up-meta">'.motor_userpage_author($e['author']).' · '.date_fixed($e['created']);
    if ($e['updated']>$e['created']) echo ' · изменено '.date_fixed($e['updated']);
    echo '</p><div class="up-text">'.motor_userpage_render_text($e['text']).'</div>';
    if ($canEdit || $canDelete) {
        echo '<div class="up-actions">';
        if ($canEdit) echo '<a class="touch-link" href="'.up_link($owner,['tab'=>$tab,'edit'=>$e['id']]).'">Редактировать</a>';
        if ($canDelete) {
            echo '<details class="up-delete"><summary>Удалить</summary><p>Удалить '.($news?'эту новость':'этот отзыв').'?</p>';
            up_start_form($owner,$kind.'_delete');up_hidden('id',$e['id']);up_hidden('revision',$e['revision']);
            echo '<button type="submit" class="primary">Подтвердить удаление</button></form></details>';
        }
        echo '</div>';
    }
    echo '</article>';
}
function up_photo(string $owner,array $photo,bool $canComment): void {
    $d=$photo['data'];$id=$d[6];$gid=rawurlencode($id);$comments=motor_userpage_comments($id);
    echo '<article class="up-photo up-record" id="photo-'.up_h($id).'"><h3><a href="../gallery/index.php?action=showimg&amp;gid='.$gid.'">'.up_h(motor_gallery_plain($d[1]??'Фотография')).'</a></h3>';
    if (($d[3]??'')==='hidden') echo '<p class="up-notice">Скрыто модератором. Видно только администрации.</p>';
    echo '<a class="gallery-photo up-photo-link"'.(motor_gallery_settings()['zoom']?' data-gallery-zoom':'').' href="../gallery/fullsize.php?name='.$gid.'" aria-label="Увеличить фото: '.up_h(motor_gallery_plain($d[1]??'')).'"><img src="../gallery/resize.php?name='.$gid.'" alt="'.up_h(motor_gallery_plain($d[1]??'')).'" loading="lazy" decoding="async"></a>';
    echo '<div class="up-text">'.motor_gallery_text($d[0]??'').'</div><p class="up-meta">'.date_fixed((int)($d[4]??0)).'</p>';
    echo '<h4>Комментарии ('.$comments['count'].')</h4>';
    foreach ($comments['recent'] as $row) {
        $c=array_pad(explode('|',$row),4,'');
        echo '<div class="up-photo-comment"><p class="up-meta">'.motor_userpage_author($c[3]).' · '.date_fixed((int)$c[2]).'</p><div class="up-text">'.motor_gallery_text($c[0]).'</div></div>';
    }
    if (!$comments['count']) echo '<p class="up-meta">Пока нет комментариев.</p>';
    echo '<a class="touch-link" href="../gallery/index.php?action=komm&amp;gid='.$gid.'">Все комментарии</a>';
    if ($canComment) {
        echo '<details class="up-comment-form"><summary>Комментировать фото</summary><form class="up-form" method="post" action="../gallery/index.php?action=addkomm&amp;gid='.$gid.'">';motor_form_token();up_hidden('return_page',$owner);
        echo '<label>Комментарий<textarea name="msg" rows="3" required maxlength="2000" data-smile-picker data-smile-scope="common"></textarea></label><button class="primary" type="submit">Отправить комментарий</button></form></details>';
    }
    echo '</article>';
}

echo '<div class="userpage">';
try {
    $actor=!empty($log) && is_user()?(string)$log:'';$owner=$_GET['uz']??$actor;
    if ($owner==='') {
        echo '<h1>Моя страница</h1>';show_login('Чтобы создать свою страницу, необходимо');
    } else {
        $profile=motor_userpage_profile($owner);$self=$actor===$owner;$staff=$actor!=='' && is_admin([101,102,103,105]);
        $action=$_GET['action']??'';$tab=$_GET['tab']??'overview';
        if (!is_string($action) || !is_string($tab) || !in_array($tab,['overview','photos','news','guestbook','settings'],true)) throw new RuntimeException('Неизвестный раздел страницы.',400);
        if (!in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD','POST'],true)) throw new RuntimeException('Метод запроса не поддерживается.',405);
        if ($action!=='' || ($_SERVER['REQUEST_METHOD']??'')==='POST') {
            if (($_SERVER['REQUEST_METHOD']??'')!=='POST') throw new RuntimeException('Для изменения отправьте форму на странице.',405);
            motor_form_guard([]);
            if ($actor==='') throw new RuntimeException('Войдите на сайт, чтобы оставить запись.',403);
            $data=motor_userpage_apply($owner,$actor,$staff,$action,$_POST,SITETIME);
            $target=$action==='save'?'overview':(str_starts_with($action,'news_')?'news':'guestbook');
            $query=['tab'=>$target,'saved'=>'1'];
            if (in_array($action,['news_add','news_edit'],true)) $query['post']=motor_userpage_id($_POST['id']??null);
            $anchor=$action==='save'?'':((str_starts_with($action,'news_')?'news':'guest').'-'.motor_userpage_id($_POST['id']??null));
            header('Location: '.motor_userpage_url($owner,$query).($anchor!==''?'#'.$anchor:''),true,303);exit;
        }
        $data=motor_userpage_read($owner);
        if ($data['created'] && !$data['published'] && !$self && !$staff) throw new RuntimeException('Страница пока не опубликована.',404);
        if ($tab==='settings' && !$self) throw new RuntimeException('Настройки доступны только владельцу страницы.',403);
        $photos=motor_userpage_photos($owner);
        $title=$data['title']!==''?$data['title']:'Страница '.$owner;
        echo '<header class="up-hero"><div class="up-avatar">'.user_avatars($owner,96).'</div><div class="up-identity"><p class="up-kicker">Личная страница</p><h1>'.up_h($title).'</h1><p>'.motor_userpage_label($owner).'</p><p class="up-authority">Авторитет: <strong>'.(int)($profile[49]??0).'</strong> <span>(+'.(int)($profile[50]??0).' / −'.(int)($profile[51]??0).')</span></p></div></header>';
        if ($actor!=='' && !$self) motor_reputation_form($owner);
        echo '<div class="up-actions"><a class="touch-link" href="anketa.php?view=details&amp;uz='.rawurlencode($owner).'">Анкета пользователя</a>';
        if ($self) echo '<a class="touch-link" href="index.php?action=menu">Моё меню</a><a class="touch-link" href="'.up_link($owner,['tab'=>'settings']).'">Настроить страницу</a>';
        elseif ($actor!=='') echo '<a class="touch-link" href="privat.php?action=submit&amp;uz='.rawurlencode($owner).'">Личное сообщение</a>';
        echo '</div>';
        if (!$data['published'] && $data['created']) echo '<p class="up-notice">Страница не опубликована. Её видят только владелец и администрация.</p>';
        if (($_GET['saved']??'')==='1') echo '<p class="up-notice" role="status">Изменения сохранены.</p>';
        if (($_GET['voted']??'')==='1') echo '<p class="up-notice" role="status">Ваш голос учтён.</p>';
        if (!$data['created']) echo '<p class="up-notice">'.($self?'Страница ещё не оформлена. <a href="'.up_link($owner,['tab'=>'settings']).'">Создать свою страницу</a>':'Пользователь пока не оформил свою страницу.').'</p>';
        if ($tab!=='settings') {
            echo '<nav class="up-tabs" aria-label="Разделы личной страницы">';
            foreach (['overview'=>'Обзор','news'=>'Новости ('.count($data['news']).')','photos'=>'Фото ('.count($photos).')','guestbook'=>'Отзывы ('.count($data['guestbook']).')'] as $key=>$label) echo '<a href="'.up_link($owner,['tab'=>$key]).'"'.($tab===$key?' aria-current="page"':'').'>'.$label.'</a>';
            echo '</nav>';
        }
        if ($tab==='settings') {
            echo '<section class="up-panel"><h2>'.($data['created']?'Настройки страницы':'Создать свою страницу').'</h2><p>Добавьте название и несколько слов о себе. Ваши фотографии из галереи и авторитет появятся автоматически. Новости вы сможете публиковать здесь.</p>';
            up_start_form($owner,'save');up_hidden('revision',$data['revision']);
            echo '<label>Название страницы<input name="title" required maxlength="100" value="'.up_h($title).'"></label><label>О странице<textarea name="about" rows="5" maxlength="2000" data-smile-picker data-smile-scope="common">'.up_h($data['about']).'</textarea></label>';
            echo '<label>Кому видна страница<select name="published"><option value="1"'.($data['published'] || !$data['created']?' selected':'').'>Всем посетителям</option><option value="0"'.(!$data['published'] && $data['created']?' selected':'').'>Только мне и администрации</option></select></label>';
            echo '<label>Новые отзывы в гостевой книге<select name="guestbook_open"><option value="1"'.($data['guestbook_open']?' selected':'').'>Разрешены пользователям после входа</option><option value="0"'.(!$data['guestbook_open']?' selected':'').'>Закрыты</option></select></label>';
            echo '<p class="up-meta">Видимость страницы не меняет доступ к фотографиям в общей галерее.</p><button type="submit" class="primary">'.($data['created']?'Сохранить страницу':'Создать страницу').'</button></form></section>';
        } else {
            $pageRaw=$_GET['page']??'1';
            if (!is_string($pageRaw) || !preg_match('/^[1-9][0-9]{0,5}$/D',$pageRaw)) throw new RuntimeException('Некорректный номер страницы.',400);
            $page=(int)$pageRaw;$edit=$_GET['edit']??'';$post=$_GET['post']??'';
            if (!is_string($edit) || !is_string($post)) throw new RuntimeException('Некорректная запись.',400);
            $editing=null;
            if ($edit!=='') {
                motor_userpage_id($edit);$kind=$tab==='news'?'news':($tab==='guestbook'?'guestbook':'');
                if (!$kind) throw new RuntimeException('Неизвестный раздел записи.',400);
                foreach ($data[$kind] as $e) if ($e['id']===$edit) $editing=$e;
                if (!$editing) throw new RuntimeException('Запись не найдена.',404);
                if ($kind==='news'?!$self:$actor==='' || $editing['author']!==$actor) throw new RuntimeException('Редактировать запись может только её автор.',403);
                echo '<section class="up-panel"><h2>Редактировать '.($kind==='news'?'новость':'отзыв').'</h2>';up_editor($owner,$kind==='news'?'news':'guest',$editing);echo '</section>';
            }
            if ($tab==='overview' && $data['about']!=='') echo '<section class="up-panel"><h2>О странице</h2><div class="up-text">'.motor_userpage_render_text($data['about']).'</div></section>';
            if (in_array($tab,['overview','news'],true)) {
                echo '<section class="up-section"><div class="up-heading"><h2>Новости пользователя</h2><a class="touch-link" href="'.up_link($owner,['tab'=>'news']).'">Все новости ('.count($data['news']).')</a></div>';
                if ($self && $data['created'] && !$editing) {echo '<details class="up-panel"><summary>Написать новость</summary>';up_editor($owner,'news');echo '</details>';}
                $items=array_reverse($data['news']);$size=$tab==='overview'?3:5;$p=min($page,max(1,(int)ceil(count($items)/$size)));
                if ($post!=='') {motor_userpage_id($post);$items=array_values(array_filter($items,fn($e)=>$e['id']===$post));if (!$items) throw new RuntimeException('Новость не найдена.',404);}
                foreach ($post!==''?$items:array_slice($items,($p-1)*$size,$size) as $e) up_record($owner,'news',$e,$self,$staff,$actor);
                if (!$items) echo '<p>Новостей пока нет.</p>';
                if ($tab==='news' && $post==='') up_pager($owner,$tab,$p,count($items),$size);
                echo '</section>';
            }
            if (in_array($tab,['overview','photos'],true)) {
                $size=$tab==='overview'?2:6;$p=min($page,max(1,(int)ceil(count($photos)/$size)));
                echo '<section class="up-section"><div class="up-heading"><h2>Фотографии</h2><a class="touch-link" href="'.up_link($owner,['tab'=>'photos']).'">Все фото ('.count($photos).')</a></div>';
                if ($self) echo '<p><a class="touch-link" href="../gallery/index.php?action=addfoto">Добавить фото в галерею</a></p>';
                if (!$photos) echo '<p>Фотографий пока нет.</p>';
                echo '<div class="up-photo-grid">';foreach (array_slice($photos,($p-1)*$size,$size) as $photo) up_photo($owner,$photo,$actor!=='');echo '</div>';
                if ($tab==='photos') up_pager($owner,$tab,$p,count($photos),$size);
                echo '</section>';
            }
            if (in_array($tab,['overview','guestbook'],true)) {
                echo '<section class="up-section"><div class="up-heading"><h2>Отзывы · гостевая книга</h2><a class="touch-link" href="'.up_link($owner,['tab'=>'guestbook']).'">Все отзывы ('.count($data['guestbook']).')</a></div>';
                if (!$data['created']) echo '<p>Отзывы откроются, когда владелец оформит страницу.</p>';
                elseif (!$data['guestbook_open']) echo '<p>Владелец закрыл гостевую книгу для новых отзывов.</p>';
                elseif ($actor==='' ) show_login('Чтобы оставить отзыв, необходимо');
                elseif (!$editing) up_editor($owner,'guest');
                $size=$tab==='overview'?3:10;$p=min($page,max(1,(int)ceil(count($data['guestbook'])/$size)));
                foreach (array_slice(array_reverse($data['guestbook']),($p-1)*$size,$size) as $e) up_record($owner,'guest',$e,$self,$staff,$actor);
                if (!$data['guestbook']) echo '<p>Отзывов пока нет.</p>';
                if ($tab==='guestbook') up_pager($owner,$tab,$p,count($data['guestbook']),$size);
                echo '</section>';
            }
        }
    }
} catch (Throwable $e) {
    $code=$e->getCode();http_response_code($code>=400 && $code<=599?$code:500);
    $message=$e instanceof RuntimeException?$e->getMessage():'Не удалось открыть страницу. Повторите попытку позже.';
    echo '<div class="up-notice" role="alert">'.up_h($message).'</div>';
    foreach (['title'=>'Заголовок','about'=>'О странице','msg'=>'Текст записи'] as $field=>$label) if (isset($_POST[$field]) && is_string($_POST[$field]) && strlen($_POST[$field])<=32000) echo '<label>'.$label.' — не сохранено<textarea readonly rows="4">'.up_h($_POST[$field]).'</textarea></label>';
    if (isset($owner) && motor_userpage_login($owner)) echo '<p><a class="touch-link" href="'.up_link($owner).'">Вернуться к странице</a> · <a class="touch-link" href="anketa.php?view=details&amp;uz='.rawurlencode($owner).'">Анкета пользователя</a></p>';
}
echo '</div>';
include '../themes/'.$config['themes'].'/foot.php';
