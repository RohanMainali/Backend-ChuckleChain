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
    console.log("Token verified for user:", decoded.id)

    // Get user from the token
    req.user = await User.findById(decoded.id)

    if (!req.user) {
      console.log("User not found for token")
      return res.status(401).json({
        success: false,
        message: "User not found",
      })
    }

    next()
  } catch (err) {
    console.error("Token verification error:", err)
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    })
  }
}

