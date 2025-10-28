<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>


# API

1. Clonar proyecto
2. ```yarn install```
3. Clonar el archivo ```.env.template``` y renombrarlo a ```.env```
4. Cambiar las variables de entorno
5. Levantar la base de datos
```
docker-compose up -d
```

6. Levantar: ```yarn start:dev```


# Added extra dependencies
yarn add ioredis
yarn add @nestjs/swagger
yarn add dotenv
yarn add zod
yarn add openai
yarn add sharp

yarn add form-data --save
yarn add @nestjs/websockets @nestjs/platform-socket.io socket.io --save
yarn add cors 
yarn add pdfmake
yarn add -D @types/pdfmake
yarn add @kurkle/color


# Debian WhatsApp Web
https://github.com/remsystemCorporation/auth-nestjs/tree/main

# Actualizar paquetes
sudo apt-get update

# Instalar dependencias del sistema
sudo apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget

# Instalar Chromium
sudo apt-get install -y chromium


sudo kill -9 $(sudo lsof -t -i:3000 -i:3003)


# Restaurar bdd
sudo -i -u postgres

psql -U postgres -d sigafi_dbo -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

gunzip -c /proerp/sigafi_dbo.gz | psql -d sigafi_dbo

