FROM node:18

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies with verbose logging and legacy peer deps
RUN npm install --verbose --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 