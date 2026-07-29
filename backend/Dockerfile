FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S arena && adduser -S arena -G arena
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p tmp && chown -R arena:arena /app
USER arena
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1
CMD ["npm", "start"]
