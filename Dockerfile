# Imagem base: Node 20 (o Express 5 exige Node 18 ou maior)
FROM node:20
 
# Pasta de trabalho dentro do container
WORKDIR /app
# Copia só o package.json primeiro
COPY package.json .
 
# Instala as dependências (express, cors, multer, sqlite3)
RUN npm install
# Copia o restante do projeto para dentro da imagem
COPY . .
# 1) cria uma pasta só para os dados
# 2) move o db.json para dentro dela
# 3) deixa um atalho no lugar original
RUN mkdir -p /app/backend/data && \
    mv /app/backend/db.json /app/backend/data/db.json && \
    ln -s /app/backend/data/db.json /app/backend/db.json
# Documenta a porta usada pelo servidor
EXPOSE 3000
 
# Comando que inicia o servidor
CMD ["node", "backend/server.js"]

