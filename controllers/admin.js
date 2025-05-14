const User = require("../models/User")
const Post = require("../models/Post")
const cloudinary = require("cloudinary").v2
const archiver = require("archiver")
const axios = require("axios")
const fs = require("fs")
const path = require("path")
const os = require("os")
const { createCanvas, loadImage, registerFont } = require("canvas")

// @desc    Get admin dashboard stats
// @route   GET /api/admin/stats
// @access  Private (Admin only)
exports.getStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments()

    // Get users registered in the last 7 days
    const lastWeekUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    })

    // Get total posts count
    const totalPosts = await Post.countDocuments()

    // Get posts created in the last 7 days
    const lastWeekPosts = await Post.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    })

    // Get flagged posts count (assuming posts have a 'flagged' field)
    const flaggedPosts = await Post.countDocuments({ flagged: true })

    // Calculate growth percentages (comparing to previous period)
    const previousWeekUsers = await User.countDocuments({
      createdAt: {
        $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    })

    const previousWeekPosts = await Post.countDocuments({
      createdAt: {
        $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    })

    const userGrowth =
      previousWeekUsers > 0 ? Math.round(((lastWeekUsers - previousWeekUsers) / previousWeekUsers) * 100) : 0

    const postGrowth =
      previousWeekPosts > 0 ? Math.round(((lastWeekPosts - previousWeekPosts) / previousWeekPosts) * 100) : 0

    // Get user history data (last 7 days)
    const userHistory = await getUserHistory(7)

    // Get post history data (last 7 days)
    const postHistory = await getPostHistory(7)

    // Get post categories distribution
    const postCategories = await getPostCategories()

    // Get engagement metrics
    const engagement = await getEngagementMetrics()

    // Get top hashtags
    const topHashtags = await getTopHashtags(5)

    // Get active users by day
    const activeUsers = await getActiveUsersByDay(7)

    // Get posts by time of day
    const postsByTime = await getPostsByTimeOfDay()

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          lastWeek: lastWeekUsers,
          growth: userGrowth,
          history: userHistory,
        },
        posts: {
          total: totalPosts,
          lastWeek: lastWeekPosts,
          growth: postGrowth,
          flagged: flaggedPosts,
          history: postHistory,
          byCategory: postCategories,
        },
        engagement: engagement,
        storage: {
          used: 0, // Will be updated by cloudinary stats endpoint
          limit: 1000000000, // Default 1GB limit for example
          percentage: 0,
        },
        topHashtags: topHashtags,
        activeUsers: activeUsers,
        postsByTime: postsByTime,
      },
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// Helper function to get user registration history
async function getUserHistory(days) {
  const history = []

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)

    const count = await User.countDocuments({
      createdAt: {
        $gte: date,
        $lt: nextDate,
      },
    })

    history.unshift({
      date: date.toISOString().split("T")[0],
      count,
    })
  }

  return history
}

// Helper function to get post creation history
async function getPostHistory(days) {
  const history = []

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)

    const count = await Post.countDocuments({
      createdAt: {
        $gte: date,
        $lt: nextDate,
      },
    })

    history.unshift({
      date: date.toISOString().split("T")[0],
      count,
    })
  }

  return history
}

// Helper function to get post categories distribution
async function getPostCategories() {
  const categories = {
    entertainment: 0,
    sports: 0,
    gaming: 0,
    technology: 0,
    fashion: 0,
    music: 0,
    tv: 0,
    other: 0,
  }

  // Get counts for each category
  const categoryCounts = await Post.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ])

  // Update the categories object with actual counts
  categoryCounts.forEach((cat) => {
    if (cat._id && categories.hasOwnProperty(cat._id)) {
      categories[cat._id] = cat.count
    } else if (cat._id) {
      categories.other += cat.count
    }
  })

  return categories
}

// Helper function to get engagement metrics
async function getEngagementMetrics() {
  // Get total likes across all posts
  const likesResult = await Post.aggregate([
    {
      $project: {
        likeCount: { $size: "$likes" },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$likeCount" },
      },
    },
  ])

  // Get total comments across all posts
  const commentsResult = await Post.aggregate([
    {
      $project: {
        commentCount: { $size: "$comments" },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$commentCount" },
      },
    },
  ])

  // For shares, we don't have direct data, so we'll estimate
  // In a real app, you'd track shares separately
  const totalLikes = likesResult.length > 0 ? likesResult[0].total : 0
  const totalComments = commentsResult.length > 0 ? commentsResult[0].total : 0
  const estimatedShares = Math.floor(totalLikes * 0.2) // Assuming 20% of likes result in shares

  // Get engagement history for the last 7 days
  const history = []
  for (let i = 0; i < 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)

    // Get posts from this day
    const posts = await Post.find({
      createdAt: {
        $gte: date,
        $lt: nextDate,
      },
    })

    // Count likes, comments, and estimate shares
    let dayLikes = 0
    let dayComments = 0

    posts.forEach((post) => {
      dayLikes += post.likes.length
      dayComments += post.comments.length
    })

    const dayShares = Math.floor(dayLikes * 0.2)

    history.unshift({
      date: date.toISOString().split("T")[0],
      likes: dayLikes,
      comments: dayComments,
      shares: dayShares,
    })
  }

  return {
    likes: totalLikes,
    comments: totalComments,
    shares: estimatedShares,
    history: history,
  }
}

// Helper function to get top hashtags
async function getTopHashtags(limit) {
  // Aggregate hashtags across all posts
  const hashtagCounts = await Post.aggregate([
    { $unwind: "$hashtags" },
    {
      $group: {
        _id: "$hashtags",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ])

  return hashtagCounts.map((tag) => ({
    tag: tag._id,
    count: tag.count,
  }))
}

// Helper function to get active users by day
async function getActiveUsersByDay(days) {
  const history = []

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)

    // Count unique users who posted on this day
    const uniqueUsers = await Post.aggregate([
      {
        $match: {
          createdAt: {
            $gte: date,
            $lt: nextDate,
          },
        },
      },
      {
        $group: {
          _id: "$user",
        },
      },
      {
        $count: "count",
      },
    ])

    const count = uniqueUsers.length > 0 ? uniqueUsers[0].count : 0

    history.unshift({
      date: date.toISOString().split("T")[0],
      count,
    })
  }

  return history
}

// Helper function to get posts by time of day
async function getPostsByTimeOfDay() {
  const hourCounts = Array(24).fill(0)

  // Get all posts
  const posts = await Post.find({}, { createdAt: 1 })

  // Count posts by hour
  posts.forEach((post) => {
    const hour = new Date(post.createdAt).getHours()
    hourCounts[hour]++
  })

  // Format for chart
  return hourCounts.map((count, hour) => ({
    hour,
    count,
  }))
}

// @desc    Get Cloudinary usage stats
// @route   GET /api/admin/cloudinary/stats
// @access  Private (Admin only)
exports.getCloudinaryStats = async (req, res) => {
  try {
    // Check if Cloudinary is properly configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(200).json({
        success: true,
        data: {
          usage: {
            storage: {
              used: 0,
              limit: 1000000000, // Default 1GB limit for example
            },
          },
          message: "Cloudinary not configured",
        },
      })
    }

    // Configure cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })

    try {
      const result = await cloudinary.api.usage()

      // Get storage history for the last 7 days
      const storageHistory = await getStorageHistory(7)

      // Add storage history to the result
      result.storage_history = storageHistory

      res.status(200).json({
        success: true,
        data: result,
      })
    } catch (cloudinaryError) {
      console.error("Cloudinary API error:", cloudinaryError)

      // Return a fallback response with zeros
      res.status(200).json({
        success: true,
        data: {
          usage: {
            storage: {
              used: 0,
              limit: 1000000000, // Default 1GB limit for example
            },
          },
          error: "Failed to fetch Cloudinary stats",
        },
      })
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// Helper function to simulate storage history
// In a real app, you would track this data over time
async function getStorageHistory(days) {
  // Get current storage usage
  let currentUsage = 0

  try {
    const result = await cloudinary.api.usage()
    currentUsage = result.usage.storage.used || 0
  } catch (error) {
    console.error("Error getting Cloudinary usage:", error)
  }

  // Generate history with a slight decrease each day going back
  const history = []
  let usage = currentUsage

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)

    // Reduce usage by a random amount (1-5%) for each day back
    if (i > 0) {
      const reductionFactor = 1 - (Math.random() * 0.04 + 0.01)
      usage = Math.floor(usage * reductionFactor)
    }

    history.unshift({
      date: date.toISOString().split("T")[0],
      used: usage,
    })
  }

  return history
}

// @desc    Download posts/memes as a zip file
// @route   GET /api/admin/posts/download
// @access  Private (Admin only)
exports.downloadPosts = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      })
    }

    // Parse dates
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Add one day to end date to include the entire end date
    end.setDate(end.getDate() + 1)

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Please use YYYY-MM-DD format.",
      })
    }

    console.log(`Fetching posts between ${start.toISOString()} and ${end.toISOString()}`)

    // Query posts within the date range
    const posts = await Post.find({
      createdAt: {
        $gte: start,
        $lt: end,
      },
    }).populate("user", "username")

    if (!posts || posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No posts found within the specified date range",
      })
    }

    console.log(`Found ${posts.length} posts to download`)

    // Set up the response headers for a zip file
    res.setHeader("Content-Type", "application/zip")
    res.setHeader("Content-Disposition", `attachment; filename=memes_${startDate}_to_${endDate}.zip`)
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition")

    // Create a zip archive
    const archive = archiver("zip", {
      zlib: { level: 5 }, // Compression level
    })

    // Listen for all archive data to be written
    archive.on("error", (err) => {
      console.error("Archive error:", err)
      // If headers haven't been sent yet, send an error response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Error creating archive: " + err.message,
        })
      }
    })

    // Pipe the archive to the response
    archive.pipe(res)

    // Create a temporary directory for downloaded images
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memes-"))
    console.log(`Created temporary directory: ${tempDir}`)

    // Process each post
    const downloadPromises = posts.map(async (post, index) => {
      try {
        // Skip if no image URL
        if (!post.image) {
          console.log(`Post ${post._id} has no image, skipping`)
          return
        }

        // Extract image URL
        const imageUrl = post.image
        console.log(`Processing image: ${imageUrl} for post ${post._id}`)

        // Generate a unique filename
        const username = post.user ? post.user.username : "unknown"
        const sanitizedUsername = username.replace(/[^a-z0-9]/gi, "_").toLowerCase()
        const postDate = new Date(post.createdAt).toISOString().split("T")[0]
        const filename = getStandardFilename(post);
        const filePath = path.join(tempDir, filename)

        // Download the image
        try {
          const response = await axios({
            method: "GET",
            url: imageUrl,
            responseType: "stream",
            timeout: 10000, // 10 second timeout
          })

          // Save the image to the temporary directory
          const writer = fs.createWriteStream(filePath)
          response.data.pipe(writer)

          return new Promise((resolve, reject) => {
            writer.on("finish", () => {
              console.log(`Successfully downloaded and saved: ${filename}`)
              // Add the file to the archive
              archive.file(filePath, { name: filename })
              resolve()
            })
            writer.on("error", (err) => {
              console.error(`Error writing file ${filename}:`, err)
              reject(err)
            })
          })
        } catch (downloadError) {
          console.error(`Error downloading image for post ${post._id}:`, downloadError.message)
          // Continue with other posts even if one download fails
        }
      } catch (error) {
        console.error(`Error processing post ${post._id}:`, error)
        // Continue with other posts even if one fails
      }
    })

    try {
      // Wait for all downloads to complete
      await Promise.all(downloadPromises.filter(Boolean))
      console.log("All downloads completed, finalizing archive")

      // Finalize the archive
      await archive.finalize()
      console.log("Archive finalized successfully")
    } catch (promiseError) {
      console.error("Error during download promises:", promiseError)
      // If headers haven't been sent yet, send an error response
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Error processing downloads: " + promiseError.message,
        })
      }
    }

    // Clean up the temporary directory after a delay to ensure all files are processed
    setTimeout(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
        console.log(`Cleaned up temporary directory: ${tempDir}`)
      } catch (error) {
        console.error("Error cleaning up temporary directory:", error)
      }
    }, 5000)
  } catch (error) {
    console.error("Error downloading posts:", error)
    // If headers haven't been sent yet, send an error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to download posts: " + error.message,
      })
    }
  }
}

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getUsers = async (req, res) => {
  try {
    // Add pagination
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 50
    const startIndex = (page - 1) * limit

    // Get total count for pagination
    const total = await User.countDocuments()

    // Get users with pagination
    const users = await User.find().select("-password").skip(startIndex).limit(limit).sort({ createdAt: -1 })

    // Add post count and follower count for each user
    const enhancedUsers = await Promise.all(
      users.map(async (user) => {
        const postCount = await Post.countDocuments({ user: user._id })
        return {
          ...user.toObject(),
          postCount,
          followerCount: user.followers.length,
          status: user.status || "active", // Ensure status is included
        }
      }),
    )

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: enhancedUsers,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Get single user
// @route   GET /api/admin/users/:id
// @access  Private (Admin only)
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

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

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin only)
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

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

// @desc    Suspend or activate a user
// @route   PUT /api/admin/users/:id/status
// @access  Private (Admin only)
exports.updateUserStatus = async (req, res) => {
  try {
    const { status, suspensionReason } = req.body

    if (!status || !["active", "suspended"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'active' or 'suspended'",
      })
    }

    // Create update object
    const updateData = { status }

    // If suspending, add reason and timestamp
    if (status === "suspended") {
      if (!suspensionReason) {
        return res.status(400).json({
          success: false,
          message: "Suspension reason is required when suspending a user",
        })
      }
      updateData.suspensionReason = suspensionReason
      updateData.suspendedAt = Date.now()
    } else {
      // If activating, clear suspension data
      updateData.suspensionReason = ""
      updateData.suspendedAt = null
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.status(200).json({
      success: true,
      data: user,
      message: `User ${status === "active" ? "activated" : "suspended"} successfully`,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.status(200).json({
      success: true,
      data: {},
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Get all posts
// @route   GET /api/admin/posts
// @access  Private (Admin only)
exports.getPosts = async (req, res) => {
  try {
    const posts = await Post.find().populate("user", "username profilePicture")

    // Transform posts to ensure consistent structure
    const formattedPosts = posts.map((post) => {
      return {
        id: post._id,
        text: post.text || "",
        image: post.image || "",
        category: post.category || "other",
        createdAt: post.createdAt,
        user: {
          id: post.user ? post.user._id : null,
          username: post.user ? post.user.username : "Unknown",
          profilePicture: post.user ? post.user.profilePicture : null,
        },
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        comments: Array.isArray(post.comments) ? post.comments.length : 0,
        flagged: post.flagged || false,
      }
    })

    res.status(200).json({
      success: true,
      count: formattedPosts.length,
      data: formattedPosts,
    })
  } catch (error) {
    console.error("Error fetching posts:", error)
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Get flagged posts
// @route   GET /api/admin/posts/flagged
// @access  Private (Admin only)
exports.getFlaggedPosts = async (req, res) => {
  try {
    const posts = await Post.find({ flagged: true }).populate("user", "username profilePicture")

    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// @desc    Moderate a post (flag/unflag)
// @route   PUT /api/admin/posts/:id/moderate
// @access  Private (Admin only)
exports.moderatePost = async (req, res) => {
  try {
    const { action } = req.body

    if (!action || !["flag", "unflag", "delete"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be 'flag', 'unflag', or 'delete'",
      })
    }

    if (action === "delete") {
      const post = await Post.findByIdAndDelete(req.params.id)

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        })
      }

      return res.status(200).json({
        success: true,
        data: {},
        message: "Post deleted successfully",
      })
    }

    const flagged = action === "flag"

    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { flagged },
      {
        new: true,
        runValidators: true,
      },
    ).populate("user", "username profilePicture")

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    res.status(200).json({
      success: true,
      data: post,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// Helper function to draw text with outline
const drawTextWithStyles = (ctx, memeText, imageWidth, imageHeight) => {
  // Calculate actual position based on percentage values
  const xPos = (memeText.x / 100) * imageWidth
  const yPos = (memeText.y / 100) * imageHeight

  // Set text properties
  ctx.textAlign = memeText.textAlign || "center"

  // Set font with proper styling
  let fontStyle = ""
  if (memeText.bold) fontStyle += "bold "
  if (memeText.italic) fontStyle += "italic "

  // Use the exact font size from the meme text
  const fontSize = memeText.fontSize || 36
  ctx.font = `${fontStyle}${fontSize}px ${memeText.fontFamily || "Impact, sans-serif"}`

  // Set text color
  ctx.fillStyle = memeText.color || "#FFFFFF"

  // Apply text transformations
  let text = memeText.text || ""
  if (memeText.uppercase) {
    text = text.toUpperCase()
  }

  // Handle text with line breaks
  const lines = text.split("\n")

  // Draw each line of text
  lines.forEach((line, index) => {
    const lineY = yPos + index * (fontSize * 1.2)

    // Draw text with outline if specified
    if (memeText.outline) {
      ctx.strokeStyle = "#000000"
      ctx.lineWidth = 3
      ctx.strokeText(line, xPos, lineY)
    }

    // Draw the text
    ctx.fillText(line, xPos, lineY)

    // Add underline if specified
    if (memeText.underline) {
      const textWidth = ctx.measureText(line).width
      const startX = xPos - (ctx.textAlign === "center" ? textWidth / 2 : 0)
      const endX = startX + textWidth

      ctx.beginPath()
      ctx.moveTo(startX, lineY + 5)
      ctx.lineTo(endX, lineY + 5)
      ctx.strokeStyle = memeText.color || "#FFFFFF"
      ctx.lineWidth = 2
      ctx.stroke()
    }
  })
}

// Helper function to generate a meme image with captions
const generateMemeImage = async (imageBuffer, post) => {
  try {
    // Load the image
    const image = await loadImage(imageBuffer)

    // Create canvas with image dimensions
    const canvas = createCanvas(image.width, image.height)
    const ctx = canvas.getContext("2d")

    // Handle different caption placement types
    if (post.captionPlacement === "whitespace") {
      // For whitespace placement, create a taller canvas with white space at top
      const captionHeight = 60 // Height for caption area
      const newCanvas = createCanvas(image.width, image.height + captionHeight)
      const newCtx = newCanvas.getContext("2d")

      // Fill the caption area with white
      newCtx.fillStyle = "#FFFFFF"
      newCtx.fillRect(0, 0, image.width, captionHeight)

      // Draw the image below the caption area
      newCtx.drawImage(image, 0, captionHeight, image.width, image.height)

      // Add the caption text
      newCtx.fillStyle = "#000000"
      newCtx.font = "bold 24px 'Impact', sans-serif"
      newCtx.textAlign = "center"
      newCtx.textBaseline = "middle"

      // Draw the text in the center of the white area
      newCtx.fillText(post.text || "", image.width / 2, captionHeight / 2)

      // Return the combined image
      return newCanvas.toBuffer("image/jpeg")
    } else {
      // For standard meme placement, draw the image first
      ctx.drawImage(image, 0, 0, image.width, image.height)

      // If there are no meme texts but there is a caption, add it as a simple overlay
      if ((!post.memeTexts || post.memeTexts.length === 0) && post.text) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
        ctx.fillRect(0, 0, image.width, 60)

        ctx.fillStyle = "#FFFFFF"
        ctx.font = "bold 20px Arial, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(post.text, image.width / 2, 30)
      }

      // Draw each meme text with proper positioning and styling
      if (Array.isArray(post.memeTexts) && post.memeTexts.length > 0) {
        post.memeTexts.forEach((memeText) => {
          drawTextWithStyles(ctx, memeText, image.width, image.height)
        })
      }

      // Return the final image
      return canvas.toBuffer("image/jpeg")
    }
  } catch (error) {
    console.error("Error generating meme image:", error)
    return null
  }
}

// @desc    Download memes in a date range as a zip file
// @route   GET /api/admin/download-memes
// @access  Admin
exports.downloadMemes = async (req, res) => {
  const getStandardFilename = (post) => {
    const date = new Date(post.createdAt).toISOString().split("T")[0];
    const username = post.user ? post.user.username.replace(/[^a-z0-9]/gi, "_").toLowerCase() : "unknown";
    return `${date}_${username}_${post._id}.jpg`;
  };  
  try {
    const { fromDate, toDate } = req.query

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide fromDate and toDate parameters",
      })
    }

    const from = new Date(fromDate)
    const to = new Date(toDate)

    // Add one day to the end date to include the entire day
    to.setDate(to.getDate() + 1)

    // Validate dates
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Please use YYYY-MM-DD format",
      })
    }

    console.log(`Fetching memes between ${from.toISOString()} and ${to.toISOString()}`)

    // Query MongoDB for posts in the date range
    const posts = await Post.find({
      createdAt: { $gte: from, $lt: to },
    }).populate({
      path: "user",
      select: "username",
    })

    console.log(`Found ${posts.length} memes in the date range`)

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No memes found in this date range",
      })
    }

    // Set headers for zip file download
    res.setHeader("Content-Type", "application/zip")
    res.setHeader("Content-Disposition", `attachment; filename=memes_${fromDate}_to_${toDate}.zip`)
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition")

    // Create a zip archive
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    })

    // Pipe the archive to the response
    archive.pipe(res)

    // Create a JSON file with metadata about all posts
    const metadata = posts.map((post) => ({
      id: post._id,
      username: post.user ? post.user.username : "unknown",
      text: post.text || "",
      category: post.category || "",
      createdAt: post.createdAt,
      likes: Array.isArray(post.likes) ? post.likes.length : 0,
      comments: Array.isArray(post.comments) ? post.comments.length : 0,
      hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
      imageUrl: post.image || "",
    }))

    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" })

    // Create CSV content for image name and meme caption
    let csvContent = "Image Name,Meme Caption\n";

    posts.forEach((post) => {
      if (post.image) {
        const date = new Date(post.createdAt).toISOString().split("T")[0];
        const username = post.user ? post.user.username.replace(/[^a-z0-9]/gi, "_").toLowerCase() : "unknown";
        const filename = getStandardFilename(post);
        const caption = (post.text || "").replace(/"/g, '""'); // Escape double quotes for CSV
        csvContent += `"${filename}","${caption}"\n`;
      }
    });

    archive.append(csvContent, { name: "captions.csv" });


    console.log("Added metadata.json to archive")

    // Create a temporary directory for downloaded images
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memes-"))
    console.log(`Created temporary directory: ${tempDir}`)

    // Download each image from Cloudinary and add to zip
    const downloadPromises = posts.map(async (post, index) => {
      try {
        if (!post.image) {
          console.log(`Post ${post._id} has no image, skipping`)
          return
        }

        // Create a filename with username, date and post ID
        const date = new Date(post.createdAt).toISOString().split("T")[0]
        const username = post.user ? post.user.username.replace(/[^a-z0-9]/gi, "_").toLowerCase() : "unknown"
        const filename = getStandardFilename(post);
        const filePath = path.join(tempDir, filename)
        const memePath = path.join(tempDir, `meme_${filename}`)

        console.log(`Downloading image for post ${post._id}: ${post.image}`)

        try {
          // Download the image from Cloudinary
          const response = await axios({
            method: "GET",
            url: post.image,
            responseType: "arraybuffer",
            timeout: 15000, // 15 second timeout
          })

          // Save the original image to the temporary directory
          fs.writeFileSync(filePath, Buffer.from(response.data))

          // Add the original image to the zip file
          archive.file(filePath, { name: `images/${filename}` })

          // Generate meme image with captions
          if (Array.isArray(post.memeTexts) && post.memeTexts.length > 0) {
            try {
              const memeBuffer = await generateMemeImage(Buffer.from(response.data), post)

              if (memeBuffer) {
                // Save the meme image
                fs.writeFileSync(memePath, memeBuffer)

                // Add the meme image to the zip
                archive.file(memePath, { name: `memes/${filename}` })
              }
            } catch (memeError) {
              console.error(`Error generating meme for post ${post._id}:`, memeError)
            }
          } else {
            // If no meme texts, just copy the original image to memes folder
            archive.file(filePath, { name: `memes/${filename}` })
          }

          // Create a text file with meme details
          const details = `
              Post ID: ${post._id}
              User: ${post.user ? post.user.username : "unknown"}
              Text: ${post.text || ""}
              Category: ${post.category || ""}
              Created: ${post.createdAt}
              Likes: ${Array.isArray(post.likes) ? post.likes.length : 0}
              Comments: ${Array.isArray(post.comments) ? post.comments.length : 0}
              Hashtags: ${Array.isArray(post.hashtags) ? post.hashtags.join(", ") : "None"}
              Caption Placement: ${post.captionPlacement || ""}
              Image URL: ${post.image || ""}
          `.trim()

          archive.append(details, { name: `details/${filename}.txt` })

          return { success: true, id: post._id }
        } catch (downloadError) {
          console.error(`Error downloading image for post ${post._id}:`, downloadError.message)
          // Continue with other images even if one fails
          return { success: false, id: post._id, error: downloadError.message }
        }
      } catch (error) {
        console.error(`Error processing post ${post._id}:`, error.message)
        // Continue with other posts even if one fails
        return { success: false, id: post._id, error: error.message }
      }
    })

    try {
      // Wait for all downloads to complete
      const results = await Promise.all(downloadPromises)
      console.log("All downloads completed, finalizing archive")

      // Add a summary of processing results
      const summary = {
        totalPosts: posts.length,
        processed: results.length,
        successful: results.filter((r) => r && r.success).length,
        failed: results.filter((r) => r && !r.success).length,
        errors: results.filter((r) => r && !r.success).map((r) => ({ id: r.id, error: r.error })),
      }

      archive.append(JSON.stringify(summary, null, 2), { name: "summary.json" })

      // Finalize the archive
      await archive.finalize()
      console.log("Archive finalized successfully")
    } catch (promiseError) {
      console.error("Error during download promises:", promiseError)
      // If headers haven't been sent yet, send an error response
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Error processing downloads: " + promiseError.message,
        })
      }
    }

    // Clean up the temporary directory after a delay to ensure all files are processed
    setTimeout(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
        console.log(`Cleaned up temporary directory: ${tempDir}`)
      } catch (error) {
        console.error("Error cleaning up temporary directory:", error)
      }
    }, 5000)
  } catch (error) {
    console.error("Error in downloadMemes:", error)

    // If headers haven't been sent yet, send an error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error while creating zip file",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    } else {
      // If headers were already sent, we need to end the response
      res.end()
    }
  }
}
