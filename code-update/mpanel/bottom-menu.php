<?php
require_once '../includes/start.php';require_once '../includes/functions.php';require_once '../includes/header.php';require_once '../includes/bottom-menu.php';
if(!motor_brand_owner())motor_request_reject(403,'Редактирование нижнего меню доступно только владельцу сайта.');
header('Cache-Control: private, no-store');$error='';$settings=null;
try {
    $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','HEAD','POST'],true))throw new RuntimeException('Метод запроса не поддерживается.',405);
    if($method==='POST'){motor_bottom_save($_POST);header('Location: bottom-menu.php?saved=1',true,303);exit;}
    $settings=motor_bottom_settings();
}catch(Throwable $e){http_response_code($e instanceof InvalidArgumentException?400:(in_array($e->getCode(),[403,405,409],true)?$e->getCode():503));$error=$e instanceof InvalidArgumentException||$e instanceof RuntimeException?$e->getMessage():'Не удалось сохранить меню.';try{$settings=motor_bottom_settings();}catch(Throwable $ignored){}}
include '../themes/'.$config['themes'].'/index.php';show_title('menu.gif','Нижнее меню сайта');$h='motor_brand_escape';
echo '<section class="bottom-menu-settings"><p>Настройте панель быстрых переходов: «Главная · Новости · Форум · Гостевая · Темы». Можно заменить разделы, подписи и значки, переставить или скрыть пункты. Всего доступно пять мест.</p>';
if($error!=='')echo '<p class="notice-error" role="alert">'.$h($error).'</p>';
if($error===''&&($_GET['saved']??'')==='1')echo '<p class="theme-success" role="status">Нижнее меню сохранено для всех тем и страниц.</p>';
if($settings!==null){
    $version=motor_bottom_version($settings);$draft=$error!==''&&($_SERVER['REQUEST_METHOD']??'GET')==='POST';
    $value=static function(string $key,string $fallback)use($draft):string{return $draft&&isset($_POST[$key])&&is_string($_POST[$key])&&strlen($_POST[$key])<=200?$_POST[$key]:$fallback;};
    $select=static function(string $name,string $label,array $options,string $selected)use($h):void{echo '<label>'.$h($label).'<select name="'.$h($name).'">';foreach($options as $v=>$text)echo '<option value="'.$h((string)$v).'"'.((string)$v===$selected?' selected':'').'>'.$h($text).'</option>';echo '</select></label>';};
    echo '<form method="post" action="bottom-menu.php">';motor_form_token();echo '<input type="hidden" name="version" value="'.$h($value('version',$version)).'"><input type="hidden" name="operation" value="save">';
    $select('enabled','Показывать нижнее меню',['1'=>'Да','0'=>'Нет'],$value('enabled',$settings['enabled']?'1':'0'));
    $targets=array_map(fn($v)=>$v[0],motor_bottom_targets());
    foreach($settings['items'] as $i=>$item){$id=$item['id'];echo '<fieldset><legend>Пункт '.$id.'</legend><div class="bottom-menu-fields">';
        echo '<label>Название<input name="label_'.$id.'" required maxlength="24" value="'.$h($value('label_'.$id,$item['label'])).'"></label>';
        $select('target_'.$id,'Куда ведёт пункт',$targets,$value('target_'.$id,$item['target']));
        $select('icon_'.$id,'Значок',motor_bottom_icons(),$value('icon_'.$id,$item['icon']));
        $select('position_'.$id,'Порядок слева направо',array_combine(range(1,5),range(1,5)),$value('position_'.$id,(string)($i+1)));
        $select('enabled_'.$id,'Показывать пункт',['1'=>'Да','0'=>'Нет'],$value('enabled_'.$id,$item['enabled']?'1':'0'));
        echo '</div></fieldset>';
    }
    echo '<p>Номера порядка должны быть разными. Скрытые пункты сохраняют настройки. Длинные подписи сокращаются на узком экране. В широких темах на компьютере используется верхнее меню, как и раньше.</p><button class="primary" type="submit">Сохранить нижнее меню</button></form>';
    echo '<h2>Сохранённое меню</h2>';motor_bottom_render($settings,true);
    echo '<form method="post" action="bottom-menu.php">';motor_form_token();echo '<input type="hidden" name="version" value="'.$version.'"><input type="hidden" name="operation" value="defaults"><button type="submit">Вернуть стандартное меню</button></form>';
}
echo '<p><a href="../index.php">Посмотреть на сайте</a> · <a href="index.php">В админку</a></p></section>';
include '../themes/'.$config['themes'].'/foot.php';
