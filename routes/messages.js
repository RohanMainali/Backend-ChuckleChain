const express = require("express");
const {
  getConversations,
  getOrCreateConversation,
  sendMessage,
  markMessagesAsRead,
  sharePost,
  getUnreadMessagesCount,
  deleteMessage,
} = require("../controllers/messages");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Protect all routes
router.use(protect);

router.get("/conversations", getConversations);
router.get("/conversations/:userId", getOrCreateConversation);
router.post("/:conversationId", sendMessage);
router.put("/:conversationId/read", markMessagesAsRead);
router.post("/share", protect, sharePost); // New route for sharing posts
router.get("/unread-count", protect, getUnreadMessagesCount);
router.delete("/:conversationId/:messageId", deleteMessage); // Add route for deleting messages

module.exports = router;
