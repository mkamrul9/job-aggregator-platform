# service-scraper/Dockerfile

# Stage 1: Build the Go binary
FROM golang:1.22-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Compile a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /scraper-bin .

# Stage 2: The Production Environment (needs browser dependencies)
FROM ubuntu:22.04

WORKDIR /app

# Install dependencies required for Playwright and Chromium
RUN apt-get update && apt-get install -y \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from the builder stage
COPY --from=builder /scraper-bin /app/scraper-bin

# Install Playwright browsers (Chromium)
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npx playwright install chromium --with-deps

CMD ["/app/scraper-bin"]
