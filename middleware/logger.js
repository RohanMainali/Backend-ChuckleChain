// Create a new logging middleware
const logger = (req, res, next) => {
  const start = Date.now();

  // Log request details
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

  // Log request body for POST/PUT requests (but sanitize sensitive data)
  if (["POST", "PUT"].includes(req.method) && req.body) {
    const sanitizedBody = { ...req.body };

    // Remove sensitive fields
    if (sanitizedBody.password) sanitizedBody.password = "[REDACTED]";
    if (sanitizedBody.token) sanitizedBody.token = "[REDACTED]";

    console.log("Request body:", JSON.stringify(sanitizedBody));
  }

  // Capture response data
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] Response ${res.statusCode} - ${duration}ms`
    );

    // Call the original send function
    return originalSend.call(this, body);
  };

  next();
};

module.exports = logger;
