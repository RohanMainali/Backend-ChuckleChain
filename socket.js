const socketIo = require("socket.io")
const jwt = require("jsonwebtoken")
const User = require("./models/User")

// Map to store active user connections
const activeUsers = new Map()
// Map to store last seen timestamps
const lastSeenTimestamps = new Map()

const initializeSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins = [process.env.CLIENT_URL || "https://chucklechain.vercel.app", "http://localhost:3000"]

        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true)

        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`
          console.warn(msg)
          // Still allow the connection but log a warning
          // return callback(new Error(msg), false);
        }
        return callback(null, true)
      },
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["Authorization"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      console.log("Socket authentication attempt")

      // Check for token in different places
      const authHeader = socket.handshake.auth.token || socket.handshake.headers.authorization
      const cookieToken = socket.handshake.headers.cookie?.split("token=")[1]?.split(";")[0]

      let token

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1]
      } else if (authHeader) {
        token = authHeader
      } else if (cookieToken) {
        token = cookieToken
      }

      if (!token) {
        console.log("No token found in socket connection")
        return next(new Error("Authentication error: No token provided"))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.id)

      if (!user) {
        console.log("User not found for socket connection")
        return next(new Error("User not found"))
      }

      console.log(`User authenticated for socket: ${user.username}`)
      socket.user = user
      next()
    } catch (error) {
      console.error("Socket authentication error:", error)
      next(new Error("Authentication error"))
    }
  })

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString()
    console.log(`User connected: ${socket.user.username} with ID: ${userId}`)

    // Add user to active users map
    activeUsers.set(userId, socket.id)

    // Remove user from lastSeenTimestamps if they're now online
    lastSeenTimestamps.delete(userId)

    // Broadcast to all clients that this user is now online
    socket.broadcast.emit("userConnected", userId)

    // Handle request for online users
    socket.on("getOnlineUsers", () => {
      socket.emit("onlineUsers", Array.from(activeUsers.keys()))
    })

    // Handle messagesRead event
    socket.on("messagesRead", ({ conversationId, userId }) => {
      // Emit an event to update the unread count in the navbar
      socket.emit("updateUnreadCount")

      // Notify the sender that their messages were read
      const recipientSocketId = activeUsers.get(userId)
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("messageRead", {
          conversationId,
          readBy: socket.user._id,
        })
      }
    })

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.username}`)

      // Store last seen timestamp
      const now = new Date()
      lastSeenTimestamps.set(userId, now)

      // Remove from active users
      activeUsers.delete(userId)

      // Broadcast to all clients that this user is now offline
      socket.broadcast.emit("userDisconnected", userId, now.toISOString())
    })

    // Send a welcome message to confirm connection
    socket.emit("welcome", { message: "Socket connection established" })

    // Send the current list of online users
    socket.emit("onlineUsers", Array.from(activeUsers.keys()))
  })

  return io
}

// Improve the emitNewMessage function to better handle message delivery
const emitNewMessage = (io, userId, message) => {
  console.log(`Attempting to emit message to user ${userId}`, message)

  const socketId = activeUsers.get(userId.toString())
  if (socketId) {
    console.log(`Socket found for user ${userId}, emitting message`)
    try {
      io.to(socketId).emit("newMessage", message)
      console.log("Message emitted successfully")
    } catch (error) {
      console.error("Error emitting message:", error)
    }
  } else {
    console.log(`No active socket found for user ${userId}`)
    // Store the message for delivery when the user connects
    // This would be implemented in a production system
  }
}

// Function to emit a new notification to a user
const emitNewNotification = (io, userId, notification) => {
  console.log(`Attempting to emit notification to user ${userId}`, notification)

  // Make sure userId is a string
  const userIdStr = userId.toString()

  const socketId = activeUsers.get(userIdStr)
  if (socketId) {
    console.log(`Socket found for user ${userIdStr}, emitting notification`)
    try {
      io.to(socketId).emit("newNotification", notification)
      console.log("Notification emitted successfully")
    } catch (error) {
      console.error("Error emitting notification:", error)
    }
  } else {
    console.log(`No active socket found for user ${userIdStr}`)
    // Store notification for delivery when user connects
    // This would require additional code to store pending notifications
  }
}

// Function to get a user's last seen timestamp
const getLastSeen = (userId) => {
  return lastSeenTimestamps.get(userId.toString()) || null
}

// Function to check if a user is online
const isUserOnline = (userId) => {
  return activeUsers.has(userId.toString())
}

module.exports = {
  initializeSocket,
  emitNewMessage,
  emitNewNotification,
  getLastSeen,
  isUserOnline,
}

