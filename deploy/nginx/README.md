# nginx: фото товаров и файлы 1С

Живые файлы на сервере (эти — копии для истории):

- `/etc/nginx/conf.d/kosmetichka-images-map.conf` ← `kosmetichka-images-map.conf`
- `/etc/nginx/snippets/kosmetichka-images.conf` ← `kosmetichka-images.conf`
- в `/etc/nginx/sites-enabled/kosmetichka` добавлены блоки (перед «Обмен с 1С» и внутри `location ^~ /api/1c/`):

```nginx
# Файлы обмена с 1С (клиенты, заказы, каталог) лежат рядом с фото — наружу не отдаём
location ~* "^/(?:api/)?1c/.+\.(?:xml|zip|json|txt|csv|log|tmp)$" { return 404; }

# Фото товаров: nginx отдаёт с диска сам
location ~* "^/1c/(?<kos_img>.+\.(?:jpe?g|png|webp|gif))$" { include snippets/kosmetichka-images.conf; }
location @kos_site { proxy_pass http://127.0.0.1:3000; proxy_set_header Host kosmetichka-opt.ru;
    proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Real-IP $remote_addr; proxy_http_version 1.1; }

# внутри location ^~ /api/1c/ { ... }
location ~* "^/api/1c/.+\.(?:xml|zip|json|txt|csv|log|tmp)$" { return 404; }
location ~* "^/api/1c/(?<kos_img>.+\.(?:jpe?g|png|webp|gif))$" { include snippets/kosmetichka-images.conf; }
```

Резервная копия прежнего конфига: `~/nginx-backups/`. Откат: вернуть её в sites-enabled, `nginx -t && systemctl reload nginx`.

Уменьшенные копии nginx отдаёт без сравнения дат, поэтому при замене фото (обмен с 1С,
scripts/import-images.js, scripts/compress-images.js) копии удаляются — `dropThumbs` в lib/thumb.ts.

# nginx: test.kosmetichka-opt.ru (тесты для сотрудников)

- `/etc/nginx/sites-enabled/kosmetichka-test` ← `test-subdomain.conf` (+ HTTPS, который дописывает certbot)
- `/etc/nginx/snippets/kosmetichka-test-proxy.conf` ← `kosmetichka-test-proxy.conf`

Поддомен проксирует на тот же сайт (127.0.0.1:3000), но наружу открыт только раздел `/academy`,
его API и вход/выход сотрудника; остальные адреса ведут на `/academy`. Ставится и обновляется
скриптом `deploy/academy-setup.sh` (миграция, тесты, nginx, certbot). Нужна A-запись `test` → IP сервера.
