# A construire depuis la racine du projet :
# docker build -f frontend/Dockerfile -t namluuu/frontend:1.0 .

# Etape 1 : compilation du site
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Etape 2 : seuls les fichiers statiques partent dans l'image finale (nginx non root)
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
