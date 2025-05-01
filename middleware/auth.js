const jwt = require("jsonwebtoken")
const User = require("../models/User")

// Protect routes
exports.protect = async (req, res, next) => {
  let token

  // Check for token in cookies, headers, or query params
  if (req.cookies.token) {
    token = req.cookies.token
  } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1]
  } else if (req.query.token) {
    // Allow token in query params for socket connections
    token = req.query.token
  }

  // Make sure token exists
  if (!token) {
    console.log("No token found in request")
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    })
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log("Token verified for user:", decoded.id, "with role:", decoded.role)

    // Get user from the token
    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if user is suspended
    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact support for assistance.",
      })
    }

    // Set user in request object
    req.user = user

    // Add role to request for easier access
    req.user.role = decoded.role || req.user.role

    next()
  } catch (err) {
    console.error("Token verification error:", err)
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    })
  }
}
