# frontend-admin/Dockerfile

# Stage 1: Build the Angular app
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Compile the app for production (outputs to /app/dist/frontend-admin)
RUN npm run build --configuration=production

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy the compiled static files to Nginx's default public folder
# Note: Check your angular.json "outputPath" if the folder name differs
COPY --from=builder /app/dist/frontend-admin/browser /usr/share/nginx/html

# Copy a custom Nginx config to handle Angular routing (fallback to index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
