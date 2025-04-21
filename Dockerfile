# Use Node.js 18 as the base image
FROM node:18-alpine

# Install Python and dependencies
RUN apk add --no-cache python3 py3-pip build-base libsndfile-dev

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy Python requirements
COPY python/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the port (5005 from .env)
EXPOSE 5005

# Start the application
CMD ["node", "dist/index.js"]