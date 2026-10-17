<?php
if (!defined('BASEDIR')) { http_response_code(403); exit; }

// Return an accepted coding, identity, or an empty string when none is acceptable.
function motor_compression_encoding(string $accept): string {
    $quality = [];
    foreach (explode(',', strtolower($accept)) as $entry) {
        $parts = array_map('trim', explode(';', $entry));
        $coding = array_shift($parts);
        if ($coding === 'x-gzip') $coding = 'gzip';
        if (!in_array($coding, ['gzip', 'deflate', 'identity', '*'], true)) continue;
        $q = 1.0;
        if ($parts) {
            $q = count($parts) === 1 && preg_match('/^q\s*=\s*(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/D', $parts[0], $match) ? (float)$match[1] : 0.0;
        }
        // A duplicate must not override an explicit refusal.
        $quality[$coding] = isset($quality[$coding]) ? min($quality[$coding], $q) : $q;
    }
    $chosen = ''; $best = 0.0;
    foreach (['gzip', 'deflate'] as $coding) {
        $q = $quality[$coding] ?? $quality['*'] ?? 0.0;
        if ($q > $best) { $chosen = $coding; $best = $q; }
    }
    if (($quality['identity'] ?? 0.0) > $best) return 'identity';
    if ($chosen !== '') return $chosen;
    $identity = $quality['identity'] ?? (($quality['*'] ?? 1.0) === 0.0 ? 0.0 : 1.0);
    return $identity > 0.0 ? 'identity' : '';
}

function compress_output_gzip($output) { return gzencode($output, 5); }
// HTTP deflate requires the zlib wrapper, not a raw RFC 1951 stream.
function compress_output_deflate($output) { return gzcompress($output, 5); }

function motor_start_compression($enabled): void {
    global $support_gzip, $support_deflate;
    $support_gzip = $support_deflate = false;
    if (!$enabled || !extension_loaded('zlib') || headers_sent()) return;
    $automatic = strtolower(trim((string)ini_get('zlib.output_compression')));
    if (!in_array($automatic, ['', '0', 'off'], true)) return;
    $handlers = array_map('strtolower', array_merge(ob_list_handlers(), [(string)ini_get('output_handler')]));
    if (array_intersect($handlers, ['ob_gzhandler', 'zlib.output_compression', 'zlib output compression', 'compress_output_gzip', 'compress_output_deflate'])) return;
    foreach (headers_list() as $header) if (stripos($header, 'Content-Encoding:') === 0) return;
    // TE describes transfer coding and must not be used as Accept-Encoding.
    $encoding = motor_compression_encoding((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''));
    header('Vary: Accept-Encoding', false);
    if ($encoding === '') { http_response_code(406); exit; }
    if ($encoding === 'identity') return;
    $support_gzip = $encoding === 'gzip';
    $support_deflate = $encoding === 'deflate';
    header('Content-Encoding: '.$encoding);
    header_remove('Content-Length');
    ob_start($support_gzip ? 'compress_output_gzip' : 'compress_output_deflate');
}
