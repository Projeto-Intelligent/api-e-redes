# Use the official lightweight Node.js active LTS image
FROM node:20-alpine

# Set node environment to production
ENV NODE_ENV=production

# Create app directory and set ownership to node user
WORKDIR /usr/src/app
RUN chown node:node /usr/src/app

# Switch to non-root user
USER node

# Copy package files first for better caching
COPY --chown=node:node package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy the rest of the application source code
COPY --chown=node:node . .

# Expose port 8080 (Cloud Run standard, though our pull subscriber runs in background)
EXPOSE 8080

# Run the subscriber daemon
CMD [ "npm", "start" ]
