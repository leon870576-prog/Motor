FROM php:8.4-apache-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpng-dev libjpeg62-turbo-dev libfreetype6-dev libonig-dev libzip-dev \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j2 gd mbstring zip \
 && a2enmod rewrite headers \
 && rm -rf /var/lib/apt/lists/*
ADD motor-source.tar.gz /var/www/html/
RUN mkdir -p /opt/motor-seed \
 && mv /var/www/html/local /opt/motor-seed/local \
 && ln -s /data/local /var/www/html/local \
 && chown -R www-data:www-data /var/www/html
COPY apache.conf /etc/apache2/sites-available/000-default.conf
COPY php.ini /usr/local/etc/php/conf.d/motor-test.ini
COPY entrypoint.sh /usr/local/bin/motor-entrypoint
COPY auth.php /opt/motor-auth.php
RUN chmod 755 /usr/local/bin/motor-entrypoint
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["motor-entrypoint"]
CMD ["apache2-foreground"]
