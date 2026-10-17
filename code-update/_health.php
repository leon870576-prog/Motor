<?php
header('Content-Type: text/plain; charset=utf-8');
header('X-Motor-Release: 2026-10-17-nastya-replies-r1');
if (!is_dir('/data/local') || !is_writable('/data/local')) {
    http_response_code(503);
    echo 'Data storage unavailable';
    exit;
}
echo 'ok';
