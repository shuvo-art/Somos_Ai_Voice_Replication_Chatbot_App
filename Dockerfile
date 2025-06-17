# Stage 1: Build Stage
# Use Node.js 18 as the base image
FROM node:18-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libsndfile1-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Copy Python requirements and install Python dependencies in a virtual environment
COPY python/requirements.txt ./python/
RUN python3 -m venv /app/venv && \
    . /app/venv/bin/activate && \
    pip install --no-cache-dir -r python/requirements.txt

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
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

# Copy virtual environment from builder
COPY --from=builder /app/venv ./venv

# Copy built artifacts and other required files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/python ./python
COPY --from=builder /app/uploads ./uploads

# Install production Node.js dependencies only
RUN npm ci --omit=dev --no-audit --no-fund

# Set environment variables for Python
ENV PATH="/app/venv/bin:$PATH"

# Create a non-root user to run the app
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
USER appuser

# Expose application port
EXPOSE 5005

# Start the application
CMD ["node", "dist/index.js"]
