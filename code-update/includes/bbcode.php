<?php
// All input is text. Only bundled smiles, line breaks and explicit BB tags become HTML.
function motor_bb_url(string $url): ?string {
    $url = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (strlen($url) > 2048 || preg_match('~[\x00-\x20\x7f<>"\x27\\\\]~', $url)) return null;
    $parts = parse_url($url);
    if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) ||
        empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) return null;
    return htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function motor_bb_render($message): string {
    $message = str_replace("\x1A", '', (string)$message);
    $saved = [];
    $hold = static function (string $html) use (&$saved): string {
        $key = "\x1A".count($saved)."\x1A"; $saved[$key] = $html; return $key;
    };
    // Code remains literal: do not parse links, tags or smiles inside it.
    $message = preg_replace_callback('~\[code\](.*?)\[/code\]~is', static function ($m) use ($hold) {
        $text = preg_replace('~<br\s*/?>~i', "\n", nosmiles($m[1]));
        return $hold('<code class="motor-code">'.htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false).'</code>');
    }, $message);
    $message = preg_replace_callback('~<img\b[^>]*>|<br\s*/?>~i', static function ($m) use ($hold) {
        if (preg_match('~^<br\b~i', $m[0])) return $hold('<br />');
        $smile = motor_smile_from_tag($m[0]);
        return $smile ? $hold(motor_smile_image($smile[0], $smile[1])) : $m[0];
    }, $message);
    $message = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false);
    $message = preg_replace_callback('~\[url=([^\]\r\n]{1,2048})\](.*?)\[/url\]|\[url\](.*?)\[/url\]~is', static function ($m) use ($hold) {
        $address = $m[1] !== '' ? $m[1] : ($m[3] ?? '');
        $label = $m[1] !== '' ? $m[2] : ($m[3] ?? '');
        $href = motor_bb_url($address);
        if ($href === null || str_contains($label, "\x1A")) return $m[0];
        return $hold('<a href="'.$href.'" rel="ugc nofollow noopener">'.$label.'</a>');
    }, $message);
    // Link plain HTTP(S) text as well. Exclude BB delimiters and protected fragments.
    $message = preg_replace_callback('~https?://[^\s<>\[\]\x1A]+~iu', static function ($m) use ($hold) {
        $address = rtrim($m[0], '.,!?:;)');
        $tail = substr($m[0], strlen($address)); $href = motor_bb_url($address);
        return $href === null ? $m[0] : $hold('<a href="'.$href.'" rel="ugc nofollow noopener">'.$address.'</a>').$tail;
    }, $message);
    $tags = ['b'=>['b',''], 'i'=>['i',''], 'u'=>['u',''], 'del'=>['del',''],
        'big'=>['span',' class="bb-big"'], 'small'=>['span',' class="bb-small"'],
        'red'=>['span',' class="bb-red"'], 'green'=>['span',' class="bb-green"'],
        'blue'=>['span',' class="bb-blue"'], 'yellow'=>['span',' class="bb-yellow"'], 'q'=>['q','']];
    // Stack parsing keeps crossed/unclosed input from escaping its surrounding layout.
    $parts = preg_split('~(\[/?(?:b|i|u|del|big|small|red|green|blue|yellow|q)\])~i', $message, -1, PREG_SPLIT_DELIM_CAPTURE);
    $stack = []; $html = '';
    foreach ($parts as $part) {
        if (!preg_match('~^\[(/?)([a-z]+)\]$~i', $part, $m)) { $html .= $part; continue; }
        $name = strtolower($m[2]);
        if (!isset($tags[$name])) { $html .= $part; continue; }
        [$tag, $attrs] = $tags[$name];
        if ($m[1] === '' && count($stack) < 16) { $stack[] = $name; $html .= '<'.$tag.$attrs.'>'; }
        elseif ($m[1] !== '' && end($stack) === $name) { array_pop($stack); $html .= '</'.$tag.'>'; }
        else $html .= $part;
    }
    foreach (array_reverse($stack) as $name) $html .= '</'.$tags[$name][0].'>';
    return motor_smiles_render(strtr($html, $saved));
}
