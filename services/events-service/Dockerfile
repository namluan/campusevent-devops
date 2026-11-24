# A construire depuis la racine du projet :
# docker build -f services/events-service/Dockerfile -t namluuu/events-service:1.0 .
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/services/events-service
COPY services/events-service/package*.json ./
RUN npm ci --omit=dev
COPY services/events-service/src ./src
COPY proto /app/proto
USER 1000
EXPOSE 3001 50051
CMD ["node", "src/index.js"]
