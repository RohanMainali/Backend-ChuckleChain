const express = require("express");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  runCleanup, // Add this new controller
} = require("../controllers/notifications");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Protect all routes
router.use(protect);

router.get("/", getNotifications);
router.get("/count", getUnreadCount);
router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);
router.post("/cleanup", runCleanup); // Add a new cleanup route

module.exports = router;
