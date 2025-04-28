const User = require("../models/User")


// @desc    Register user
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const { username, email, password } = req.body

    // Check if user already exists
    const userExists = await User.findOne({ $or: [{ email }, { username }] })

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: userExists.email === email ? "Email already in use" : "Username already taken",
      })
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
    })

    // Send token response
    sendTokenResponse(user, 201, res)
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body

    // Validate username & password
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username and password",
      })
    }

    // Check for user
    const user = await User.findOne({ username }).select("+password")

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      })
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password)

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      })
    }

    // Send token response
    sendTokenResponse(user, 200, res)
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = (req, res) => {
  // Updated cookie options for cross-domain
  const cookieOptions = {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: true,
    sameSite: "none",
  }

  res.cookie("token", "none", cookieOptions)

  res.status(200).json({
    success: true,
    data: {},
  })
}

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    res.status(200).json({
      success: true,
      data: user,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// Helper function to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken()

  // Cookie options for cross-domain
  const options = {
    expires: new Date(Date.now() + process.env.JWT_EXPIRE.match(/\d+/)[0] * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: true, // Required for cross-domain cookies
    sameSite: "none", // Required for cross-domain cookies
  }

  // Remove password from output
  user.password = undefined

  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    token, // Include token in response body for localStorage
    data: user,
  })
}

