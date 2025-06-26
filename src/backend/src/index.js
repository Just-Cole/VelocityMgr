
const path = require('path');

// Load environment variables from the root .env file
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const apiRouter = require('./routes/index.js'); 

const app = express();
// Use a specific environment variable for the backend port, defaulting to 3005
const port = parseInt(process.env.BACKEND_PORT, 10) || 3005;
const hostname = '0.0.0.0'; 

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// All API routes will be handled by apiRouter
app.use('/api', apiRouter); 

// Global error handler
app.use((err, req, res, next) => {
  console.error("API Error Handler Caught:", err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'An internal server error occurred in the API.',
    // Optionally include stack in development
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

const server = app.listen(port, hostname, (err) => {
  if (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  };
  console.log(`Backend API server listening on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`);
});

// Graceful shutdown logic
const gracefulShutdown = (signal) => {
  console.log(`[${signal}] Received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Backend server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown after a timeout if server.close() hangs
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
