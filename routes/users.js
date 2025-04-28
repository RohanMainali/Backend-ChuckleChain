const express = require("express");
const {
  getUserProfile,
  getMyProfile,
  updateProfile,
  followUser,
  getTopUsers,
  getUserFollowers,
  getUserFollowing,
  resetRelationships,
  debugRelationships,
  searchUsers,
  getUserSettings,
  updateUserSettings,
  changePassword,
  deleteAccount,
} = require("../controllers/users");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.put("/me", protect, updateProfile);
router.delete("/me", protect, deleteAccount);
router.put("/change-password", protect, changePassword);
router.get("/top", protect, getTopUsers);
router.get("/debug-relationships", protect, debugRelationships);
router.post("/reset-relationships", protect, resetRelationships);
router.get("/search", protect, searchUsers);
router.get("/:username", protect, getUserProfile);
router.put("/:username/follow", protect, followUser);
router.get("/:username/followers", protect, getUserFollowers);
router.get("/:username/following", protect, getUserFollowing);

// Add routes for user settings
router.get("/settings", protect, getUserSettings);
router.put("/settings", protect, updateUserSettings);

module.exports = router;
