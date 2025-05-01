const express = require("express")
const {
  getStats,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getPosts,
  getFlaggedPosts,
  moderatePost,
  getCloudinaryStats,
  downloadPosts,
  downloadMemes,
  updateUserStatus,
} = require("../controllers/admin")
const { protect } = require("../middleware/auth")
const { isAdmin } = require("../middleware/admin")

const router = express.Router()

// Apply auth middleware to all routes
router.use(protect)
router.use(isAdmin)

// Stats routes
router.get("/stats", getStats)
router.get("/cloudinary/stats", getCloudinaryStats)

// User routes
router.get("/users", getUsers)
router.get("/users/:id", getUser)
router.put("/users/:id", updateUser)
router.delete("/users/:id", deleteUser)
router.put("/users/:id/status", updateUserStatus)

// Post routes
router.get("/posts", getPosts)
router.get("/posts/flagged", getFlaggedPosts)
router.put("/posts/:id/moderate", moderatePost)
router.get("/posts/download", downloadPosts)

// New route for downloading memes
router.get("/download-memes", downloadMemes)

module.exports = router
