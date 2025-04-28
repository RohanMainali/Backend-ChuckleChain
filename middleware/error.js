// Create a new error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err.stack);

  // Default error response
  const error = {
    success: false,
    message: err.message || "Server Error",
    statusCode: err.statusCode || 500,
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === "development") {
    error.stack = err.stack;
  }

  res.status(error.statusCode).json(error);
};

module.exports = errorHandler;
