FROM node:18-slim

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Clean npm cache and install dependencies
RUN npm cache clean --force && \
    npm install --verbose --legacy-peer-deps || \
    (echo "npm install failed" && exit 1)

# Copy the rest of the application
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 