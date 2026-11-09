# The School ERP API. Build:  docker build -t school-erp-api api
# A glibc image (not alpine) because argon2 and sharp ship native binaries for it.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# DATABASE_URL is not needed to generate the client or to compile.
RUN npx prisma generate && npm run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
# Everything stays installed so `prisma migrate deploy` and the seed can run from this image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma7.config.ts ./prisma7.config.ts
COPY --from=build /app/package.json ./package.json
# Local file storage (only used when FILES_DRIVER=local; production should use s3).
RUN mkdir -p /data/files && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
