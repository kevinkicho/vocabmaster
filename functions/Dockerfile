FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY lib/ ./lib/
ENV PORT=8080
EXPOSE 8080
CMD ["node", "lib/server.js"]
