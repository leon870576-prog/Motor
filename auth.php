<?php
$user = getenv('MOTOR_TEST_USER') ?: 'tester';
$password = getenv('MOTOR_TEST_PASSWORD') ?: '';
if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/D', $user) || strlen($password) < 16 || strpbrk($password, "\r\n") !== false) {
    fwrite(STDERR, "Set MOTOR_TEST_USER (letters/digits/-/_) and MOTOR_TEST_PASSWORD (at least 16 characters).\n");
    exit(1);
}
if (file_put_contents('/run/motor.htpasswd', $user . ':' . password_hash($password, PASSWORD_BCRYPT) . "\n", LOCK_EX) === false) exit(1);
