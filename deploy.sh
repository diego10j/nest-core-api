#!/bin/bash
set -e

echo "=== Iniciando despliegue ==="
cd /proerp/backend/nest-core-api

echo "1. Actualizando código desde Git..."
git fetch origin
git reset --hard origin/main

echo "2. Instalando dependencias..."
yarn install --production=false

echo "3. Haciendo build..."
yarn build

echo "4. Reiniciando aplicación..."
# Si usas PM2
pm2 restart nest-core-api

# Si usas systemd
# sudo systemctl restart nest-core-api

echo "5. Verificando estado..."
sleep 3
pm2 status nest-core-api

echo "=== Despliegue completado ==="
