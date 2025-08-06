# Stage 1: Build Stage
FROM node:18-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libsndfile1-dev \
    libffi-dev \
    ffmpeg \
    nano \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Copy Python requirements and install Python dependencies in a virtual environment
COPY python/requirements.txt ./python/
COPY python/ ./python/
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r python/requirements.txt

# Copy the entire application source code
COPY . .

# Build TypeScript code
RUN npm run build

# Stage 2: Production Image
FROM node:18-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    libsndfile1 \
    libffi-dev \
    ffmpeg \
    curl \
    wget \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads /app/python && \
    chown -R node:node /app/uploads /app/python && \
    chmod -R 755 /app/uploads /app/python

# Copy virtual environment from builder
COPY --from=builder /app/venv ./venv

# Copy built artifacts and other required files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/python ./python
COPY --from=builder /app/.env ./.env

# Install production Node.js dependencies
RUN npm ci --omit=dev --no-audit --no-fund

# Set ownership and permissions for the application directories
RUN chown -R node:node /app && \
    chmod -R 755 /app

# Switch to non-root user
USER node

# Set environment variables for Python
ENV PATH="/app/venv/bin:$PATH"

# Expose application port
EXPOSE 5005

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD wget -q -O - http://127.0.0.1:5005/api/v1/health || exit 1

# Start the application
CMD ["node", "-r", "dotenv/config", "dist/index.js"]