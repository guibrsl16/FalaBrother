# Brotherhood Cursos — imagem de produção.
# Build da interface (Vite/React) + servidor Node servindo tudo numa porta só.

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# python3/make/g++: só para o caso de algum pacote nativo precisar compilar
# (ex.: sharp, bufferutil) quando não há binário pronto para a arquitetura.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY servidor ./servidor
COPY scripts ./scripts

# Onde fica a pasta dados/ dentro do container — aponte o volume persistente
# do EasyPanel para este caminho.
ENV PASTA_DADOS=/app/dados
RUN mkdir -p /app/dados

EXPOSE 8787
CMD ["node", "servidor/index.js"]
