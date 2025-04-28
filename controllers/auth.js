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

// @desc    Register admin user
// @route   POST /api/auth/admin-signup
// @access  Private (requires admin token)
exports.adminSignup = async (req, res) => {
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

    // Create admin user
    const user = await User.create({
      username,
      email,
      password,
      role: "admin",
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
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  })

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

  const options = {
    expires: new Date(Date.now() + process.env.JWT_EXPIRE.match(/\d+/)[0] * 24 * 60 * 60 * 1000),
    httpOnly: true,
  }

  // Remove password from output
  user.password = undefined

  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    token,
    data: user,
  })
}

