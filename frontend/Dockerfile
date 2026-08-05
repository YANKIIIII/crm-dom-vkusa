# Dev image: Vite HMR. Production uses Dockerfile.prod.
# rolldown-vite requires util.styleText — available from Node 20.12+.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
