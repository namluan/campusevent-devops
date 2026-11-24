# A construire depuis la racine du projet :
# docker build -f services/bookings-service/Dockerfile -t namluuu/bookings-service:1.0 .
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/services/bookings-service
COPY services/bookings-service/package*.json ./
RUN npm ci --omit=dev
COPY services/bookings-service/src ./src
COPY proto /app/proto
USER 1000
EXPOSE 3002
CMD ["node", "src/index.js"]
