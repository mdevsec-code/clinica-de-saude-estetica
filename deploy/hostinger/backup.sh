#!/usr/bin/env bash
# Backup diário do banco e das fotos/fichas digitalizadas (ver DEPLOY.md,
# seção 7). Na VPS não há Neon fazendo backup automático — é este script.
#
# Agendar (como o usuário deploy):  crontab -e
#   0 3 * * * /home/deploy/clinica/deploy/hostinger/backup.sh >> /home/deploy/backups/backup.log 2>&1
#
# Restaurar o banco a partir de um dump:
#   pg_restore --clean --if-exists --no-owner -d "<url sem ?schema=public>" db-AAAA-MM-DD.dump
# Restaurar as fotos/fichas de um dia:
#   rsync -a --delete ~/backups/uploads-AAAA-MM-DD/ ~/clinica/server/uploads/
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Lê a DATABASE_URL do mesmo .env que a API usa. O "?schema=public" é
# sintaxe do Prisma — o pg_dump (libpq) recusa a URL com ele, então corta
# tudo a partir do "?".
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/server/.env" | head -n1 | cut -d= -f2- | tr -d '"')"
PG_URL="${DATABASE_URL%%\?*}"

pg_dump --format=custom --no-owner --no-acl "$PG_URL" -f "$BACKUP_DIR/db-$STAMP.dump"
chmod 600 "$BACKUP_DIR/db-$STAMP.dump"

# Fotos/fichas: um snapshot por dia (uploads-AAAA-MM-DD/), cada um completo
# e restaurável sozinho — mas arquivo que não mudou desde o snapshot
# anterior vira hardlink pra ele (--link-dest) em vez de cópia, então só o
# que é novo ocupa disco. Um tar.gz diário duplicaria todas as fotos a cada
# dia e encheria o disco da VPS em poucas semanas.
if [ -d "$APP_DIR/server/uploads" ]; then
  PREVIOUS="$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'uploads-*' ! -name "uploads-$STAMP" | sort | tail -n1)"
  rsync -a --delete ${PREVIOUS:+--link-dest="$PREVIOUS"} \
    "$APP_DIR/server/uploads/" "$BACKUP_DIR/uploads-$STAMP/"
fi

# Rotação pela data no nome, não pelo mtime: o rsync -a copia o mtime da
# pasta de origem, então o mtime do snapshot não diz quando ele foi feito.
# Apagar um snapshot antigo só libera o espaço dos arquivos que nenhum
# snapshot mais novo ainda referencia.
CUTOFF="$(date -d "-$KEEP_DAYS days" +%F)"
for old in "$BACKUP_DIR"/db-*.dump "$BACKUP_DIR"/uploads-*; do
  [ -e "$old" ] || continue
  name="$(basename "$old")"
  day="${name#db-}"; day="${day#uploads-}"; day="${day%.dump}"
  if [[ "$day" < "$CUTOFF" ]]; then
    rm -rf -- "$old"
  fi
done

echo "$(date '+%F %T') backup ok: db-$STAMP.dump, uploads-$STAMP/"
