#!/usr/bin/env bash
# Одноразовая настройка тестов для сотрудников на сервере. Повторный запуск безопасен.
#   cd ~/kosmetichka-b2b && bash deploy/academy-setup.sh
# Через GitHub: Actions → Deploy → Run workflow → command:
#   cd ~/kosmetichka-b2b && bash deploy/academy-setup.sh
#
# Шаги: 1) таблицы в БД  2) загрузка тестов из academy/tests  3) nginx для поддомена  4) SSL (certbot)
# Шаги 3–4 пропускаются, если поддомен ещё не указывает на этот сервер (нет A-записи в DNS).
set -euo pipefail

DOMAIN=test.kosmetichka-opt.ru
SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SITE_DIR"

echo "== 1/4 Таблицы в базе"
npx prisma db execute --schema prisma/schema.prisma --file academy-migration.sql

echo "== 2/4 Загрузка тестов"
npm run -s import:tests

echo "== 3/4 nginx для $DOMAIN"
SRV_IP=$(curl -4 -s --max-time 5 https://ifconfig.me || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ -z "$DNS_IP" ] || [ "$DNS_IP" != "$SRV_IP" ]; then
  echo "!! $DOMAIN указывает на '${DNS_IP:-ничего}', а сервер — $SRV_IP."
  echo "!! Добавьте A-запись test → $SRV_IP у регистратора домена и запустите скрипт ещё раз."
  echo "   (Тесты уже работают на основном домене: https://kosmetichka-opt.ru/academy)"
  exit 0
fi

SITE_CONF=/etc/nginx/sites-enabled/kosmetichka-test
SNIPPET=/etc/nginx/snippets/kosmetichka-test-proxy.conf
mkdir -p ~/nginx-backups
[ -f "$SITE_CONF" ] && cp "$SITE_CONF" ~/nginx-backups/kosmetichka-test.$(date +%Y%m%d-%H%M%S)
cp deploy/nginx/kosmetichka-test-proxy.conf "$SNIPPET"
if ! grep -q "ssl_certificate" "$SITE_CONF" 2>/dev/null; then
  # Если certbot уже дописал HTTPS — не затираем его правки
  cp deploy/nginx/test-subdomain.conf "$SITE_CONF"
fi
if ! nginx -t; then
  echo "!! nginx -t не прошёл — убираю новый конфиг, nginx не перезагружался"
  rm -f "$SITE_CONF"
  exit 1
fi
systemctl reload nginx

echo "== 4/4 SSL-сертификат"
if grep -q "ssl_certificate" "$SITE_CONF"; then
  echo "HTTPS уже настроен"
elif command -v certbot >/dev/null; then
  certbot --nginx -d "$DOMAIN" --non-interactive --redirect --keep-until-expiring
  nginx -t && systemctl reload nginx
else
  echo "!! certbot не установлен — сайт пока доступен по http://$DOMAIN"
  exit 0
fi

code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/academy/login" || true)
echo "Проверка https://$DOMAIN/academy/login → $code"
