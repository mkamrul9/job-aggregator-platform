# Ingress SSL/TLS Certificates

This directory holds the TLS certificates and private keys mounted into the Nginx API gateway (`api-gateway`) at `/etc/nginx/ssl:ro`.

- `server.crt`: TLS certificate (public certificate chain)
- `server.key`: TLS private key (excluded from git via `.gitignore` to prevent credential exposure)

For local staging or development environments, generate self-signed staging certificates:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt \
  -subj "/CN=localhost"
```
In production, mount valid certificates issued by an approved Certificate Authority (e.g. Let's Encrypt / Certbot).
