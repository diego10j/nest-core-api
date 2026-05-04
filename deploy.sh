#!/bin/bash
set -e

echo "=== Iniciando despliegue ==="
cd /proerp/backend/nest-core-api

echo "1. Actualizando código desde Git..."
git pull

echo "2. Instalando dependencias..."
yarn install 

echo "3. Haciendo build..."
yarn build

echo "4. Reiniciando aplicación..."
pm2 delete nest-core-api 2>/dev/null || true
pm2 start npm --name "nest-core-api" -- run start:prod
pm2 save

echo "5. Verificando estado..."
sleep 3
pm2 status nest-core-api

echo "=== Despliegue completado ==="
