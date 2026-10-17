FROM php:8.4-apache-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends libwebp-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev libonig-dev libzip-dev \
 && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
 && docker-php-ext-install -j2 gd mbstring zip exif \
 && a2enmod rewrite headers \
 && rm -rf /var/lib/apt/lists/*
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
ADD motor-source.tar.gz /var/www/html/
ADD motor-code.tar.gz /var/www/html/
COPY code-update/ /tmp/motor-update/code-update/
COPY avatar-artwork/ /tmp/motor-update/avatar-artwork/
COPY CODE_UPDATE_SHA256 apply-code-update.sh /tmp/motor-update/
RUN sh /tmp/motor-update/apply-code-update.sh /var/www/html \
 && rm -rf /tmp/motor-update
RUN mkdir -p /opt/motor-seed \
 && mv /var/www/html/local /opt/motor-seed/local \
 && ln -s /data/local /var/www/html/local \
 && chown -R www-data:www-data /var/www/html
COPY apache.conf /etc/apache2/sites-available/000-default.conf
COPY php.ini /usr/local/etc/php/conf.d/motor-test.ini
COPY entrypoint.sh /usr/local/bin/motor-entrypoint
COPY auth.php /opt/motor-auth.php
COPY migrate.php /opt/motor-migrate.php
COPY validate.php /opt/motor-validate.php
COPY checks/gallery-native.php /opt/motor-gallery-native.php
COPY MIGRATION.json /opt/motor-migration.json
COPY migrate-themes.php /opt/motor-migrate-themes.php
RUN chmod 755 /usr/local/bin/motor-entrypoint \
 && php /opt/motor-validate.php \
 && php /opt/motor-gallery-native.php \
 && php -l /opt/motor-migrate.php \
 && php -l /opt/motor-migrate-themes.php \
 && a2dismod mpm_event mpm_worker \
 && a2enmod mpm_prefork \
 && apache2ctl -t
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["docker-php-entrypoint"]
CMD ["motor-entrypoint", "apache2-foreground"]
