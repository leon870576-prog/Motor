<?php
// One catalogue and renderer for legacy stored images and text-only sections.
function motor_smile_catalog() {
    static $catalog = null;
    if ($catalog !== null) return $catalog;
    $catalog = [];
    foreach (['smiles', 'smiles2'] as $group) {
        foreach (glob(__DIR__.'/../images/'.$group.'/*.gif') ?: [] as $file) {
            $catalog[$group][basename($file, '.gif')] = true;
        }
    }
    return $catalog;
}

function motor_smile_image($group, $name) {
    static $sizes = [];
    $key = $group.'/'.$name;
    if (!isset($sizes[$key]) && isset(motor_smile_catalog()[$group][$name])) {
        $image = @getimagesize(__DIR__.'/../images/'.$key.'.gif');
        if ($image && $image[0] > 0 && $image[1] > 0) {
            $scale = min(1, 96/$image[0], 48/$image[1]);
            $sizes[$key] = [max(1, (int)round($image[0]*$scale)), max(1, (int)round($image[1]*$scale))];
        }
    }
    [$width, $height] = $sizes[$key] ?? [20, 20];
    $src = htmlspecialchars(BASEDIR.'images/'.$group.'/'.rawurlencode($name).'.gif', ENT_QUOTES, 'UTF-8');
    $alt = htmlspecialchars(':'.$name, ENT_QUOTES, 'UTF-8');
    return '<img class="motor-smile" src="'.$src.'" width="'.$width.'" height="'.$height.'" style="--smile-width:'.$width.'px;--smile-height:'.$height.'px" alt="'.$alt.'" />';
}

// Only recognised bundled GIFs are treated as smiles; other images are untouched.
function motor_smile_from_tag($tag) {
    if (!preg_match('~^<img\b~i', $tag) || !preg_match('~\bsrc\s*=\s*([\x22\x27])(.*?)\1~is', $tag, $src)) return null;
    $path = rawurldecode(html_entity_decode($src[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if (!preg_match('~(?:^|/)images/(smiles2?)/([^/]+)\.gif$~', $path, $match)) return null;
    $catalog = motor_smile_catalog();
    return isset($catalog[$match[1]][$match[2]]) ? [$match[1], $match[2]] : null;
}

function motor_smiles_render($message, $allow_admin = false) {
    global $config;
    $message = (string)$message;
    $catalog = motor_smile_catalog();
    $codes = [];
    foreach ($catalog as $group => $names) {
        if ($group === 'smiles2' && !$allow_admin) continue;
        foreach ($names as $name => $_) $codes[':'.$name] = $group;
    }
    uksort($codes, static function ($a, $b) { return strlen($b) <=> strlen($a); });
    $patterns = [];
    foreach ($codes as $code => $_) {
        $patterns[] = preg_quote($code, '~').(preg_match('/[a-z0-9_]$/i', $code) ? '(?![a-zA-Z0-9_])' : '');
    }
    $pattern = '~'.implode('|', $patterns).'~';
    $limit = max(-1, (int)($config['resmiles'] ?? 5));
    // Count actual images, not colons in a time, URL or an unknown smile code.
    $stored = 0;
    preg_replace_callback('~<img\b[^>]*>~i', static function ($m) use (&$stored) {
        if (motor_smile_from_tag($m[0])) $stored++;
        return $m[0];
    }, $message);
    $remaining = $limit < 0 ? -1 : max(0, $limit - $stored);
    $parts = preg_split('~(<[^>]*>|\[code\].*?\[/code\]|\[url(?:=[^\]]*)?\].*?\[/url\]|(?:https?|ftp)://[^\s<]+)~is', $message, -1, PREG_SPLIT_DELIM_CAPTURE);
    $protected = [];
    foreach ($parts as &$part) {
        if ($part === '') continue;
        if ($part[0] === '<') {
            if (!$protected && ($smile = motor_smile_from_tag($part))) $part = motor_smile_image($smile[0], $smile[1]);
            if (preg_match('~^<(\/)?(a|code|pre|script|style|textarea)\b~i', $part, $tag)) {
                $name = strtolower($tag[2]);
                if (empty($tag[1])) $protected[] = $name;
                elseif (end($protected) === $name) array_pop($protected);
            }
            continue;
        }
        if ($protected || preg_match('~^(?:\[code\]|\[url(?:=|\])|(?:https?|ftp)://)~i', $part)) continue;
        $part = preg_replace_callback($pattern, static function ($m) use ($codes, &$remaining) {
            if ($remaining === 0) return $m[0];
            if ($remaining > 0) $remaining--;
            return motor_smile_image($codes[$m[0]], substr($m[0], 1));
        }, $part);
    }
    unset($part);
    return implode('', $parts);
}

// Admin-only codes are expanded when an authorised author saves the message.
// Reading a message never grants the reader's privileges to its author.
function smiles($string) {
    return motor_smiles_render($string, is_admin([101, 102, 103, 105]));
}

function nosmiles($string) {
    return preg_replace_callback('~<img\b[^>]*>~i', static function ($m) {
        $smile = motor_smile_from_tag($m[0]);
        return $smile ? ':'.$smile[1] : $m[0];
    }, (string)$string);
}

// The catalogue is inert JSON; only bundled images and literal codes reach the UI.
function motor_smile_picker_assets() {
    if (!str_contains((string)ob_get_contents(), 'data-smile-picker') && !str_contains((string)ob_get_contents(), 'data-smile-copy')) return;
    $groups = [];
    foreach (motor_smile_catalog() as $group => $names) {
        if ($group === 'smiles2' && !is_admin([101, 102, 103, 105])) continue;
        $items = [];
        ksort($names, SORT_NATURAL | SORT_FLAG_CASE);
        foreach ($names as $name => $_) {
            $items[] = ['code' => ':'.$name, 'label' => ':'.$name,
                'image' => BASEDIR.'images/'.$group.'/'.rawurlencode($name).'.gif'];
        }
        $groups[] = ['id' => $group, 'label' => $group === 'smiles' ? 'Смайлы' : 'Админ', 'items' => $items];
    }
    $emoji = ['😊'=>'Улыбка','😀'=>'Радость','😂'=>'Смех','🤣'=>'Очень смешно','😉'=>'Подмигивание','😍'=>'Влюблённость','🥰'=>'Нежность','😘'=>'Поцелуй','😎'=>'Круто','🤔'=>'Думаю','😮'=>'Удивление','😢'=>'Грусть','😭'=>'Слёзы','😡'=>'Злость','😴'=>'Сон','🤗'=>'Объятие','👍'=>'Одобрение','👎'=>'Не нравится','👏'=>'Аплодисменты','🙌'=>'Ура','🙏'=>'Спасибо','👋'=>'Привет','💪'=>'Сила','❤️'=>'Любовь','💛'=>'Тепло','💕'=>'Сердечки','🔥'=>'Огонь','🎉'=>'Праздник','🎂'=>'День рождения','☀️'=>'Солнце','🌸'=>'Цветок','✅'=>'Готово'];
    $items = [];
    foreach ($emoji as $code => $label) $items[] = ['code' => $code, 'label' => $label, 'image' => null];
    array_splice($groups, 1, 0, [['id' => 'emoji', 'label' => 'Эмодзи', 'items' => $items]]);
    echo '<script type="application/json" id="motor-smile-data">'.json_encode($groups, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).'</script>';
    echo '<script src="'.htmlspecialchars(BASEDIR.'assets/lesika/smile-picker.js?v=tags1', ENT_QUOTES, 'UTF-8').'" defer></script>';
    echo '<script src="'.htmlspecialchars(BASEDIR.'assets/lesika/tag-picker.js?v=tags2', ENT_QUOTES, 'UTF-8').'" defer></script>';
}
