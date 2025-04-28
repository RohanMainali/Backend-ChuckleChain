const express = require("express");
const {
  createPost,
  getPosts,
  getTrendingPosts,
  getFreshPosts,
  getCategoryPosts,
  getHashtagPosts,
  getPost,
  updatePost,
  deletePost,
  likePost,
  addComment,
  deleteComment,
  likeComment,
  replyToComment,
} = require("../controllers/posts");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Protect all routes
router.use(protect);

router.route("/").get(getPosts).post(createPost);

router.get("/trending", getTrendingPosts);
router.get("/fresh", getFreshPosts);
router.get("/category/:category", getCategoryPosts);
router.get("/hashtag/:tag", getHashtagPosts);

router.route("/:id").get(getPost).put(updatePost).delete(deletePost);

router.put("/:id/like", likePost);

router.route("/:id/comments").post(addComment);

router.delete("/:id/comments/:commentId", deleteComment);
router.put("/:id/comments/:commentId/like", likeComment);
router.post("/:id/comments/:commentId/reply", replyToComment);

module.exports = router;
