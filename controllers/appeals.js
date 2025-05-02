const Appeal = require("../models/Appeal")
const User = require("../models/User")

// @desc    Submit a new appeal
// @route   POST /api/appeals/submit
// @access  Public
exports.submitAppeal = async (req, res) => {
  try {
    const { username, appealText } = req.body

    if (!username || !appealText) {
      return res.status(400).json({
        success: false,
        message: "Username and appeal text are required",
      })
    }

    // Find the user to ensure they exist and are actually suspended
    const user = await User.findOne({ username })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if the user is actually suspended
    if (user.status !== "suspended") {
      return res.status(400).json({
        success: false,
        message: "Only suspended accounts can submit appeals",
      })
    }

    // Check if there's already a pending appeal for this user
    const existingAppeal = await Appeal.findOne({
      username,
      status: "pending",
    })

    if (existingAppeal) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending appeal. Please wait for it to be reviewed.",
      })
    }

    // Create the appeal
    const appeal = await Appeal.create({
      username,
      userId: user._id,
      appealText,
    })

    res.status(201).json({
      success: true,
      data: {
        id: appeal._id,
        status: appeal.status,
        createdAt: appeal.createdAt,
      },
    })
  } catch (error) {
    console.error("Error submitting appeal:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    })
  }
}

// @desc    Check if user has a pending appeal
// @route   GET /api/appeals/check/:username
// @access  Public
exports.checkUserAppeal = async (req, res) => {
  try {
    const { username } = req.params

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      })
    }

    // Check if there's a pending appeal for this user
    const existingAppeal = await Appeal.findOne({
      username,
      status: "pending",
    })

    res.status(200).json({
      success: true,
      hasAppeal: !!existingAppeal,
      data: existingAppeal
        ? {
            id: existingAppeal._id,
            createdAt: existingAppeal.createdAt,
          }
        : null,
    })
  } catch (error) {
    console.error("Error checking user appeal:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    })
  }
}

// @desc    Get all appeals
// @route   GET /api/appeals
// @access  Private (Admin only)
exports.getAppeals = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query

    const queryOptions = {}

    // Filter by status if provided
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      queryOptions.status = status
    }

    // Calculate pagination
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    // Get total count for pagination
    const total = await Appeal.countDocuments(queryOptions)

    // Get appeals with pagination and sorting (newest first)
    const appeals = await Appeal.find(queryOptions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))
      .populate("userId", "username email profilePicture")
      .populate("reviewedBy", "username")
      .lean() // Add this to convert to plain JS objects

    // Ensure we return an array even if no results
    return res.status(200).json({
      success: true,
      count: appeals ? appeals.length : 0,
      total,
      pages: Math.ceil(total / Number.parseInt(limit)),
      currentPage: Number.parseInt(page),
      data: appeals || [],
    })
  } catch (error) {
    console.error("Error getting appeals:", error)
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
      error: error.toString(),
    })
  }
}

// @desc    Get pending appeals count
// @route   GET /api/appeals/count
// @access  Private (Admin only)
exports.getAppealsCount = async (req, res) => {
  try {
    const pendingCount = await Appeal.countDocuments({ status: "pending" })
    const approvedCount = await Appeal.countDocuments({ status: "approved" })
    const rejectedCount = await Appeal.countDocuments({ status: "rejected" })

    return res.status(200).json({
      success: true,
      data: {
        pending: pendingCount || 0,
        approved: approvedCount || 0,
        rejected: rejectedCount || 0,
      },
    })
  } catch (error) {
    console.error("Error getting appeals count:", error)
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
      error: error.toString(),
    })
  }
}

// @desc    Review an appeal (approve or reject)
// @route   PUT /api/appeals/:id
// @access  Private (Admin only)
exports.reviewAppeal = async (req, res) => {
  try {
    const { status, adminResponse } = req.body

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status (approved or rejected) is required",
      })
    }

    // Find the appeal
    const appeal = await Appeal.findById(req.params.id)

    if (!appeal) {
      return res.status(404).json({
        success: false,
        message: "Appeal not found",
      })
    }

    // Update appeal status and admin response
    appeal.status = status
    appeal.adminResponse = adminResponse || ""
    appeal.reviewedBy = req.user.id
    appeal.reviewedAt = Date.now()

    await appeal.save()

    // If approved, reactivate the user's account
    if (status === "approved") {
      const user = await User.findOne({ username: appeal.username })

      if (user) {
        user.status = "active"
        user.suspensionReason = ""
        user.suspendedAt = null
        await user.save()
      }
    }

    res.status(200).json({
      success: true,
      data: appeal,
    })
  } catch (error) {
    console.error("Error reviewing appeal:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    })
  }
}
