<?php
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';require_once '../includes/arcade-settings.php';
if(!is_admin([101]))motor_request_reject(403,'Настройки игр доступны только главному администратору.');
header('Cache-Control: private, no-store');
$error='';$notice='';$s=null;
try{
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){$s=motor_arcade_settings_save($_POST,(string)($_POST['version']??''));$notice='Настройки всех четырёх игр сохранены.';}
    else $s=motor_arcade_settings();
}catch(Throwable $e){http_response_code($e instanceof InvalidArgumentException?400:($e->getCode()===409?409:503));$error=$e instanceof InvalidArgumentException||$e->getCode()===409?$e->getMessage():'Не удалось прочитать или сохранить настройки игр.';try{$s=motor_arcade_settings();}catch(Throwable $ignored){}}
include '../themes/'.$config['themes'].'/index.php';show_title('partners.gif','Игры: вероятность и ставки');
$escape=fn($text)=>htmlspecialchars((string)$text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
if($error!=='')echo '<p class="notice-error" role="alert">'.$escape($error).'</p>';
if($notice!=='')echo '<p class="theme-success" role="status">'.$escape($notice).'</p>';
if($s!==null){
    echo '<p>Для каждой игры можно оставить случайный исход или задать шанс выигрыша от 0 до 100%. Настройки начинают действовать со следующей партии. Уже начатая игра «21» сохраняет свой режим.</p>';
    echo '<p>Процент — вероятность отдельной партии, а не гарантия точной доли побед за несколько игр. Выигрыш означает прибавку к балансу после стоимости игры. Ничья и возврат ставки выигрышем не считаются.</p>';
    echo '<form method="post"><input type="hidden" name="uid" value="'.$escape($_SESSION['token']).'"><input type="hidden" name="version" value="'.motor_arcade_version($s).'">';
    foreach(motor_arcade_names() as $id=>$name){$p=$s[$id];
        echo '<fieldset><legend>'.$name.'</legend><label for="mode-'.$id.'">Режим</label><select id="mode-'.$id.'" name="'.$id.'_mode">';
        foreach(['random'=>'Случайный исход','percent'=>'Заданный процент'] as $value=>$label)echo '<option value="'.$value.'"'.($p['mode']===$value?' selected':'').'>'.$label.'</option>';
        echo '</select><label for="percent-'.$id.'">Вероятность выигрыша, %</label><input id="percent-'.$id.'" name="'.$id.'_percent" type="number" inputmode="numeric" min="0" max="100" step="1" required value="'.$p['percent'].'"><p>Процент используется только в режиме «Заданный процент». 0% — без выигрышей, 100% — выигрыш каждой новой партии.</p>';
        if(isset($p['cost']))echo '<label for="cost-'.$id.'">Стоимость одной игры, чатлы</label><input id="cost-'.$id.'" name="'.$id.'_cost" type="number" inputmode="numeric" min="1" max="100000" step="1" required value="'.$p['cost'].'">';
        else echo '<p>Максимальная ставка «21»: '.moneys(max(0,(int)$config['ochkostavka'])).'. <a href="setting.php?action=seteleven">Изменить лимит ставки</a>.</p>';
        echo '</fieldset>';
    }
    echo '<p>Случайный режим: независимые равновероятные символы «Бандита», честные шестигранные кости, равный шанс каждого напёрстка и обычная колода «21». В заданном режиме результат выбирается с указанной вероятностью, затем формируется соответствующая комбинация. Для «21» это означает подбор карт и защиту от перебора в выигрышной раздаче. Режим виден игрокам.</p><p>В «Костях» возможна ничья, у «Бандита» — возврат стоимости. Они входят в долю исходов без выигрыша. В «Костях» и «Напёрстках» чистый выигрыш равен двум стоимостям игры; у «Бандита» выплаты зависят от линий.</p><button type="submit" class="primary">Сохранить настройки игр</button></form>';
}
echo '<p><a href="index.php">Вернуться в админку</a></p>';include '../themes/'.$config['themes'].'/foot.php';
