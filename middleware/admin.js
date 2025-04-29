// Admin middleware to check if user has admin role
const User = require("../models/User")

exports.isAdmin = async (req, res, next) => {
  try {
    // Check if user exists and is an admin
    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admin privileges required",
      })
    }

    // Add user to request object for convenience
    req.adminUser = user

    next()
  } catch (err) {
    console.error("Admin middleware error:", err)
    return res.status(500).json({
      success: false,
      message: "Server error while checking admin privileges",
    })
  }
}

// Middleware to verify admin registration token
exports.verifyAdminToken = (req, res, next) => {
  const { adminToken } = req.body

  if (!adminToken) {
    return res.status(403).json({
      success: false,
      message: "Admin token is required",
    })
  }

  // Check if the provided token matches the environment variable
  if (adminToken !== process.env.ADMIN_REGISTRATION_TOKEN) {
    console.log("Invalid token provided:", adminToken)
    return res.status(403).json({
      success: false,
      message: "Invalid admin registration token",
    })
  }

  next()
}
