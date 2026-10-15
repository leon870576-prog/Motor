#!/bin/sh
set -eu
echo 'MOTOR: preparing persistent storage and Apache runtime'
case "${PORT:-8080}" in ''|*[!0-9]*) echo 'PORT must be a number' >&2; exit 1;; esac
[ "${PORT:-8080}" -ge 1 ] && [ "${PORT:-8080}" -le 65535 ]
php /opt/motor-auth.php
chown root:www-data /run/motor.htpasswd
chmod 640 /run/motor.htpasswd
unset MOTOR_TEST_PASSWORD
mkdir -p /data/sessions
if [ ! -d /data/local ]; then
    mkdir -p /data/local.initializing
    cp -a /opt/motor-seed/local/. /data/local.initializing/
    mv /data/local.initializing /data/local
fi
php /opt/motor-migrate.php
php /opt/motor-migrate-themes.php
chown -R www-data:www-data /data/local /data/sessions
chmod 700 /data/local /data/sessions
# The data volume survives deployments; the installer must stay disabled after setup.
php -r '$p="/data/local/config.dat"; if(is_file($p)) { $c=explode("|", file_get_contents($p)); if(!empty($c[8]) && is_file("/data/local/profil/".$c[8].".prof")) @unlink("/var/www/html/INSTALL.php"); }'
sed -i "s/Listen 80$/Listen ${PORT:-8080}/" /etc/apache2/ports.conf
sed -i "s/VirtualHost \*:8080/VirtualHost *:${PORT:-8080}/" /etc/apache2/sites-available/000-default.conf
a2dismod mpm_event mpm_worker
a2enmod mpm_prefork
apache2ctl -t
echo 'MOTOR: runtime configuration verified; starting Apache'
exec docker-php-entrypoint "$@"
