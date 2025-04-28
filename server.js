// Add this line near the top of your server.js file
// to ensure environment variables are loaded
require("dotenv").config()

const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const dotenv = require("dotenv")
const cookieParser = require("cookie-parser")
const http = require("http")
const path = require("path")
const { initializeSocket } = require("./socket")

// Add these imports at the top of the file
const errorHandler = require("./middleware/error")
const logger = require("./middleware/logger")

// Load environment variables
dotenv.config()

// Import routes
const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/users")
const uploadRoutes = require("./routes/upload")
const postRoutes = require("./routes/posts")
const notificationRoutes = require("./routes/notifications")
const messageRoutes = require("./routes/messages")

// Add a scheduled notification cleanup to the server initialization
// Add this after existing imports, before initializing express app

// Add a cleanup interval for orphaned notifications
const setupNotificationCleanup = () => {
  const { cleanupOrphanedNotifications } = require("./controllers/notifications")

  // Run a cleanup every 24 hours (86400000 ms)
  setInterval(async () => {
    console.log("Running scheduled cleanup of orphaned notifications")
    try {
      const result = await cleanupOrphanedNotifications()
      console.log("Cleanup result:", result)
    } catch (error) {
      console.error("Error during scheduled notification cleanup:", error)
    }
  }, 86400000)

  // Also run once at startup
  setTimeout(async () => {
    console.log("Running initial cleanup of orphaned notifications")
    try {
      const result = await cleanupOrphanedNotifications()
      console.log("Initial cleanup result:", result)
    } catch (error) {
      console.error("Error during initial notification cleanup:", error)
    }
  }, 10000) // Wait 10 seconds after server start
}

// Initialize express app
const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 5001

// Initialize socket.io
const io = initializeSocket(server)
app.set("io", io)

// Setup the notification cleanup
setupNotificationCleanup()

// Middleware
app.use(express.json({ limit: "50mb" }))
app.use(cookieParser())

// Add the logger middleware before the routes
app.use(logger)

// Updated CORS configuration for production
const allowedOrigins = [process.env.CLIENT_URL || "https://chucklechain.vercel.app", "http://localhost:3000"]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) return callback(null, true)

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`
        return callback(new Error(msg), false)
      }
      return callback(null, true)
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
)

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err))

// Add this line to your server.js file to include the admin routes
const adminRoutes = require("./routes/admin")

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/upload", uploadRoutes)
app.use("/api/posts", postRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/messages", messageRoutes)

// Add this line where you define your routes
app.use("/api/admin", adminRoutes)

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" })
})

// Add a root route for basic info
app.get("/", (req, res) => {
  res.status(200).json({
    message: "ChuckleChain API is running",
    version: "1.0.0",
    endpoints: ["/api/auth", "/api/users", "/api/posts", "/api/notifications", "/api/messages", "/api/upload"],
  })
})

// Add the error handler middleware after the routes
// Add this at the end of the file, after all routes
app.use(errorHandler)

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// Make sure the ADMIN_REGISTRATION_TOKEN is available
console.log("Admin token configured:", process.env.ADMIN_REGISTRATION_TOKEN ? "Yes" : "No")

