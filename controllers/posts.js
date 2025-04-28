const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");

// @desc    Create a new post
// @route   POST /api/posts
// @access  Private
exports.createPost = async (req, res) => {
  try {
    const { text, image, category, memeTexts, captionPlacement, taggedUsers } =
      req.body;

    // Validate required fields
    if (!text || !image) {
      return res.status(400).json({
        success: false,
        message: "Please provide text and image for the post",
      });
    }

    // Create post
    const post = await Post.create({
      user: req.user.id,
      text,
      image,
      category,
      memeTexts,
      captionPlacement,
      taggedUsers,
    });

    // Extract hashtags from text
    const hashtagRegex = /#(\w+)/g;
    const hashtags = text.match(hashtagRegex);

    if (hashtags) {
      post.hashtags = hashtags.map((tag) => tag.substring(1));
      await post.save();
    }

    // Create notifications for tagged users
    if (taggedUsers && taggedUsers.length > 0) {
      for (const userId of taggedUsers) {
        // Don't notify yourself
        if (userId === req.user.id) continue;

        await Notification.create({
          recipient: userId,
          sender: req.user.id,
          type: "tag",
          post: post._id,
          content: text,
        });
      }
    }

    // Update user streak
    const { updateUserStreak } = require("./users");
    await updateUserStreak(req.user.id);

    // Populate user data
    await post.populate({
      path: "user",
      select: "username profilePicture",
    });

    // Populate tagged users data
    let formattedTaggedUsers = [];
    if (taggedUsers && taggedUsers.length > 0) {
      const taggedUsersData = await User.find({ _id: { $in: taggedUsers } });
      formattedTaggedUsers = taggedUsersData.map((user) => ({
        id: user._id,
        username: user.username,
      }));
    }

    res.status(201).json({
      success: true,
      data: {
        id: post._id,
        text: post.text,
        image: post.image,
        createdAt: post.createdAt,
        likes: 0,
        isLiked: false,
        comments: [],
        category: post.category,
        memeTexts: post.memeTexts,
        captionPlacement: post.captionPlacement,
        taggedUsers: formattedTaggedUsers,
        user: {
          id: post.user._id,
          username: post.user.username,
          profilePicture: post.user.profilePicture,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all posts (feed)
// @route   GET /api/posts
// @access  Private
exports.getPosts = async (req, res) => {
  try {
    // Get posts from users the current user follows + own posts
    const user = await User.findById(req.user.id);
    const following = user.following;
    following.push(req.user.id); // Include own posts

    const posts = await Post.find({ user: { $in: following } })
      .sort({ createdAt: -1 })
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      })
      .populate({
        path: "taggedUsers",
        select: "_id username",
      });

    res.status(200).json({
      success: true,
      data: posts.map((post) => {
        // Format tagged users
        const formattedTaggedUsers = post.taggedUsers
          ? post.taggedUsers.map((user) => ({
              id: user._id,
              username: user.username,
            }))
          : [];

        return {
          id: post._id,
          text: post.text,
          image: post.image,
          createdAt: post.createdAt,
          likes: post.likeCount,
          isLiked: post.likes.includes(req.user.id),
          comments: post.comments.map((comment) => ({
            id: comment._id,
            user: comment.user.username,
            profilePicture: comment.user.profilePicture,
            text: comment.text,
            replyTo: comment.replyTo,
            timestamp: comment.createdAt,
            likeCount: comment.likes ? comment.likes.length : 0,
            isLiked: comment.likes
              ? comment.likes.includes(req.user.id)
              : false,
          })),
          category: post.category,
          memeTexts: post.memeTexts,
          captionPlacement: post.captionPlacement,
          taggedUsers: formattedTaggedUsers,
          user: {
            id: post.user._id,
            username: post.user.username,
            profilePicture: post.user.profilePicture,
          },
        };
      }),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get trending posts
// @route   GET /api/posts/trending
// @access  Private
exports.getTrendingPosts = async (req, res) => {
  try {
    // Get time frame from query params (default to 7 days)
    const timeFrame = req.query.timeFrame || "week";

    // Calculate the date range based on the timeFrame
    const now = new Date();
    let startDate;

    switch (timeFrame) {
      case "day":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    // Get posts with most likes in the specified time frame
    // If no posts in that time frame, get all posts sorted by likes
    let posts = await Post.find({ createdAt: { $gte: startDate } })
      .sort({ likes: -1 })
      .limit(10)
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      });

    // If no posts found in the time frame, get all posts
    if (posts.length === 0) {
      posts = await Post.find()
        .sort({ likes: -1 })
        .limit(10)
        .populate({
          path: "user",
          select: "username profilePicture",
        })
        .populate({
          path: "comments.user",
          select: "username profilePicture",
        });
    }

    res.status(200).json({
      success: true,
      data: posts.map((post) => ({
        id: post._id,
        text: post.text,
        image: post.image,
        createdAt: post.createdAt,
        likes: post.likeCount,
        isLiked: post.likes.includes(req.user.id),
        comments: post.comments.map((comment) => ({
          id: comment._id,
          user: comment.user.username,
          profilePicture: comment.user.profilePicture,
          text: comment.text,
          replyTo: comment.replyTo,
          timestamp: comment.createdAt,
          likeCount: comment.likes ? comment.likes.length : 0,
          isLiked: comment.likes ? comment.likes.includes(req.user.id) : false,
        })),
        category: post.category,
        memeTexts: post.memeTexts,
        captionPlacement: post.captionPlacement,
        user: {
          id: post.user._id,
          username: post.user.username,
          profilePicture: post.user.profilePicture,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get fresh posts
// @route   GET /api/posts/fresh
// @access  Private
exports.getFreshPosts = async (req, res) => {
  try {
    // Get most recent posts
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      });

    res.status(200).json({
      success: true,
      data: posts.map((post) => ({
        id: post._id,
        text: post.text,
        image: post.image,
        createdAt: post.createdAt,
        likes: post.likeCount,
        isLiked: post.likes.includes(req.user.id),
        comments: post.comments.map((comment) => ({
          id: comment._id,
          user: comment.user.username,
          profilePicture: comment.user.profilePicture,
          text: comment.text,
          replyTo: comment.replyTo,
          timestamp: comment.createdAt,
          likeCount: comment.likes ? comment.likes.length : 0,
          isLiked: comment.likes ? comment.likes.includes(req.user.id) : false,
        })),
        category: post.category,
        memeTexts: post.memeTexts,
        captionPlacement: post.captionPlacement,
        user: {
          id: post.user._id,
          username: post.user.username,
          profilePicture: post.user.profilePicture,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get posts by category
// @route   GET /api/posts/category/:category
// @access  Private
exports.getCategoryPosts = async (req, res) => {
  try {
    const { category } = req.params;

    const posts = await Post.find({ category })
      .sort({ createdAt: -1 })
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      });

    res.status(200).json({
      success: true,
      data: posts.map((post) => ({
        id: post._id,
        text: post.text,
        image: post.image,
        createdAt: post.createdAt,
        likes: post.likeCount,
        isLiked: post.likes.includes(req.user.id),
        comments: post.comments.map((comment) => ({
          id: comment._id,
          user: comment.user.username,
          profilePicture: comment.user.profilePicture,
          text: comment.text,
          replyTo: comment.replyTo,
          timestamp: comment.createdAt,
          likeCount: comment.likes ? comment.likes.length : 0,
          isLiked: comment.likes ? comment.likes.includes(req.user.id) : false,
        })),
        category: post.category,
        memeTexts: post.memeTexts,
        captionPlacement: post.captionPlacement,
        user: {
          id: post.user._id,
          username: post.user.username,
          profilePicture: post.user.profilePicture,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get posts by hashtag
// @route   GET /api/posts/hashtag/:tag
// @access  Private
exports.getHashtagPosts = async (req, res) => {
  try {
    const { tag } = req.params;

    const posts = await Post.find({ hashtags: tag })
      .sort({ createdAt: -1 })
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      });

    res.status(200).json({
      success: true,
      data: posts.map((post) => ({
        id: post._id,
        text: post.text,
        image: post.image,
        createdAt: post.createdAt,
        likes: post.likeCount,
        isLiked: post.likes.includes(req.user.id),
        comments: post.comments.map((comment) => ({
          id: comment._id,
          user: comment.user.username,
          profilePicture: comment.user.profilePicture,
          text: comment.text,
          replyTo: comment.replyTo,
          timestamp: comment.createdAt,
          likeCount: comment.likes ? comment.likes.length : 0,
          isLiked: comment.likes ? comment.likes.includes(req.user.id) : false,
        })),
        category: post.category,
        memeTexts: post.memeTexts,
        captionPlacement: post.captionPlacement,
        user: {
          id: post.user._id,
          username: post.user.username,
          profilePicture: post.user.profilePicture,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get a single post
// @route   GET /api/posts/:id
// @access  Private
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      })
      .populate({
        path: "taggedUsers",
        select: "_id username",
      });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Format tagged users
    const formattedTaggedUsers = post.taggedUsers
      ? post.taggedUsers.map((user) => ({
          id: user._id,
          username: user.username,
        }))
      : [];

    res.status(200).json({
      success: true,
      data: {
        id: post._id,
        text: post.text,
        image: post.image,
        createdAt: post.createdAt,
        likes: post.likeCount,
        isLiked: post.likes.includes(req.user.id),
        comments: post.comments.map((comment) => ({
          id: comment._id,
          user: comment.user.username,
          profilePicture: comment.user.profilePicture,
          text: comment.text,
          replyTo: comment.replyTo,
          timestamp: comment.createdAt,
          likeCount: comment.likes ? comment.likes.length : 0,
          isLiked: comment.likes ? comment.likes.includes(req.user.id) : false,
        })),
        category: post.category,
        memeTexts: post.memeTexts,
        captionPlacement: post.captionPlacement,
        taggedUsers: formattedTaggedUsers,
        user: {
          id: post.user._id,
          username: post.user.username,
          profilePicture: post.user.profilePicture,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update a post
// @route   PUT /api/posts/:id
// @access  Private
exports.updatePost = async (req, res) => {
  try {
    let post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Make sure user owns the post
    if (post.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to update this post",
      });
    }

    const { text, category, memeTexts, captionPlacement } = req.body;

    // Build update object
    const updateFields = {};
    if (text !== undefined) {
      updateFields.text = text;

      // Update hashtags if text changed
      const hashtagRegex = /#(\w+)/g;
      const hashtags = text.match(hashtagRegex);

      if (hashtags) {
        updateFields.hashtags = hashtags.map((tag) => tag.substring(1));
      } else {
        updateFields.hashtags = [];
      }
    }
    if (category !== undefined) updateFields.category = category;
    if (memeTexts !== undefined) updateFields.memeTexts = memeTexts;
    if (captionPlacement !== undefined)
      updateFields.captionPlacement = captionPlacement;

    // Update the post with the new fields
    post = await Post.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      });

    // Format the response to match the expected structure
    const formattedPost = {
      id: post._id,
      text: post.text,
      image: post.image,
      createdAt: post.createdAt,
      likes: post.likeCount,
      isLiked: post.likes.includes(req.user.id),
      comments: post.comments.map((comment) => ({
        id: comment._id,
        user: comment.user.username,
        profilePicture: comment.user.profilePicture,
        text: comment.text,
        replyTo: comment.replyTo,
        timestamp: comment.createdAt,
        likeCount: comment.likes ? comment.likes.length : 0,
        isLiked: comment.likes ? comment.likes.includes(req.user.id) : false,
      })),
      category: post.category,
      memeTexts: post.memeTexts,
      captionPlacement: post.captionPlacement,
      user: {
        id: post.user._id,
        username: post.user.username,
        profilePicture: post.user.profilePicture,
      },
    };

    res.status(200).json({
      success: true,
      data: formattedPost,
    });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while updating the post",
    });
  }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Private
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Make sure user owns the post
    if (post.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }

    // Delete all notifications related to this post
    await Notification.deleteMany({ post: post._id });

    await post.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Like/unlike a post
// @route   PUT /api/posts/:id/like
// @access  Private
exports.likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if the post has already been liked
    const isLiked = post.likes.includes(req.user.id);

    if (isLiked) {
      // Unlike
      post.likes = post.likes.filter((like) => like.toString() !== req.user.id);
    } else {
      // Like
      post.likes.push(req.user.id);

      // Create notification if the post is not by the current user
      if (post.user.toString() !== req.user.id) {
        await Notification.create({
          recipient: post.user,
          sender: req.user.id,
          type: "like",
          post: post._id,
        });
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      data: {
        isLiked: !isLiked,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add comment to a post
// @route   POST /api/posts/:id/comments
// @access  Private
exports.addComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const { text, mentions } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Please provide comment text",
      });
    }

    const comment = {
      user: req.user.id,
      text,
      createdAt: new Date(),
      likes: [],
    };

    post.comments.push(comment);
    await post.save();

    // Get the newly added comment
    const newComment = post.comments[post.comments.length - 1];

    // Create notification if the post is not by the current user
    if (post.user.toString() !== req.user.id) {
      await Notification.create({
        recipient: post.user,
        sender: req.user.id,
        type: "comment",
        post: post._id,
        comment: newComment._id,
        content: text,
      });
    }

    // Create notifications for mentioned users
    if (mentions && mentions.length > 0) {
      console.log("Processing mentions in comment:", mentions);

      // Find users by username
      const mentionedUsers = await User.find({ username: { $in: mentions } });
      console.log(
        "Found mentioned users:",
        mentionedUsers.map((u) => u.username)
      );

      // Create notifications for each mentioned user
      for (const mentionedUser of mentionedUsers) {
        // Don't notify yourself or the post owner (already notified about the comment)
        if (
          mentionedUser._id.toString() === req.user.id ||
          mentionedUser._id.toString() === post.user.toString()
        ) {
          console.log(
            `Skipping notification for ${mentionedUser.username} (self or post owner)`
          );
          continue;
        }

        console.log(`Creating tag notification for ${mentionedUser.username}`);
        await Notification.create({
          recipient: mentionedUser._id,
          sender: req.user.id,
          type: "tag",
          post: post._id,
          comment: newComment._id, // Include the comment ID to differentiate from post tags
          content: text,
        });
      }
    }

    // Populate user data for the comment
    await post.populate({
      path: "comments.user",
      select: "username profilePicture",
    });

    // Find the populated comment
    const populatedComment = post.comments.id(newComment._id);

    res.status(200).json({
      success: true,
      data: {
        id: populatedComment._id,
        user: populatedComment.user.username,
        profilePicture: populatedComment.user.profilePicture,
        text: populatedComment.text,
        timestamp: populatedComment.createdAt,
        likeCount: 0,
        isLiked: false,
      },
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Like/unlike a comment
// @route   PUT /api/posts/:id/comments/:commentId/like
// @access  Private
exports.likeComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Find the comment
    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Check if the comment has already been liked
    const isLiked = comment.likes && comment.likes.includes(req.user.id);

    if (isLiked) {
      // Unlike
      comment.likes = comment.likes.filter(
        (like) => like.toString() !== req.user.id
      );
    } else {
      // Like
      if (!comment.likes) {
        comment.likes = [];
      }
      comment.likes.push(req.user.id);

      // Create notification for comment owner if it's not the current user
      if (comment.user.toString() !== req.user.id) {
        await Notification.create({
          recipient: comment.user,
          sender: req.user.id,
          type: "comment_like",
          post: post._id,
          comment: comment._id,
          content: comment.text,
        });
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      data: {
        isLiked: !isLiked,
        likeCount: comment.likes.length,
      },
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reply to a comment
// @route   POST /api/posts/:id/comments/:commentId/reply
// @access  Private
exports.replyToComment = async (req, res) => {
  try {
    console.log("Reply request received:", {
      postId: req.params.id,
      commentId: req.params.commentId,
      userId: req.user.id,
      text: req.body.text,
      mentions: req.body.mentions,
    });

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Find the parent comment
    const parentComment = post.comments.id(req.params.commentId);

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: "Parent comment not found",
      });
    }

    const { text, mentions } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Please provide reply text",
      });
    }

    // Create the reply comment
    const reply = {
      user: req.user.id,
      text,
      replyTo: parentComment._id,
      createdAt: new Date(),
      likes: [],
    };

    // Add the reply to the post's comments array
    post.comments.push(reply);
    await post.save();

    // Get the newly added reply
    const newReply = post.comments[post.comments.length - 1];

    try {
      // Populate user data for the reply
      await post.populate({
        path: "comments.user",
        select: "username profilePicture",
      });

      // Find the populated reply
      const populatedReply = post.comments.id(newReply._id);

      if (!populatedReply) {
        throw new Error("Failed to find populated reply");
      }

      // Create notification for the comment owner if it's not the current user
      if (parentComment.user.toString() !== req.user.id) {
        try {
          await Notification.create({
            recipient: parentComment.user,
            sender: req.user.id,
            type: "comment_reply",
            post: post._id,
            comment: newReply._id,
            content: text,
          });
        } catch (notifError) {
          console.error("Error creating notification:", notifError);
          // Continue even if notification creation fails
        }
      }

      // Create notifications for mentioned users
      if (mentions && mentions.length > 0) {
        // Find users by username
        const mentionedUsers = await User.find({ username: { $in: mentions } });

        // Create notifications for each mentioned user
        for (const mentionedUser of mentionedUsers) {
          // Don't notify yourself or the parent comment owner (already notified)
          if (
            mentionedUser._id.toString() === req.user.id ||
            mentionedUser._id.toString() === parentComment.user.toString()
          )
            continue;

          await Notification.create({
            recipient: mentionedUser._id,
            sender: req.user.id,
            type: "tag",
            post: post._id,
            comment: newReply._id,
            content: text,
          });
        }
      }

      // Prepare the response data carefully to avoid undefined values
      const responseData = {
        id: populatedReply._id.toString(),
        user: populatedReply.user.username || "Unknown",
        profilePicture: populatedReply.user.profilePicture || null,
        text: populatedReply.text,
        replyTo: populatedReply.replyTo
          ? populatedReply.replyTo.toString()
          : null,
        createdAt: populatedReply.createdAt,
        likeCount: 0,
        isLiked: false,
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    } catch (populateError) {
      console.error("Error populating reply:", populateError);

      // Even if population fails, we can still return a basic success response
      // since the reply was saved to the database
      return res.status(200).json({
        success: true,
        data: {
          id: newReply._id.toString(),
          user: req.user.username || "Unknown",
          text: text,
          replyTo: parentComment._id.toString(),
          createdAt: new Date(),
          likeCount: 0,
          isLiked: false,
        },
        message: "Reply added but user data could not be populated",
      });
    }
  } catch (error) {
    console.error("Error replying to comment:", error);
    res.status(500).json({
      success: false,
      message:
        error.message || "An error occurred while replying to the comment",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// @desc    Delete comment from a post
// @route   DELETE /api/posts/:id/comments/:commentId
// @access  Private
exports.deleteComment = async (req, res) => {
  try {
    console.log(
      `Deleting comment: postId=${req.params.id}, commentId=${req.params.commentId}, userId=${req.user.id}`
    );

    const post = await Post.findById(req.params.id);

    if (!post) {
      console.log("Post not found");
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Find the comment
    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      console.log("Comment not found");

      // Check if the comment might be in the process of being saved
      // by looking for a comment with the same text from this user
      const pendingComments = post.comments.filter(
        (c) =>
          c.user.toString() === req.user.id &&
          new Date(c.createdAt).getTime() > Date.now() - 60000 // Comments created in the last minute
      );

      if (pendingComments.length > 0) {
        console.log(
          "Found pending comments that might match:",
          pendingComments.length
        );

        // Delete the most recent comment from this user as a fallback
        const mostRecentComment = pendingComments.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

        console.log(
          "Deleting most recent comment as fallback:",
          mostRecentComment._id
        );

        // Remove the comment
        post.comments.pull(mostRecentComment._id);

        // Also remove any replies to this comment
        const repliesToRemove = post.comments.filter(
          (c) =>
            c.replyTo &&
            c.replyTo.toString() === mostRecentComment._id.toString()
        );

        for (const reply of repliesToRemove) {
          post.comments.pull(reply._id);
        }

        await post.save();

        // Delete any notifications related to this comment
        await Notification.deleteMany({ comment: mostRecentComment._id });

        return res.status(200).json({
          success: true,
          data: {},
          message: "Deleted most recent comment as fallback",
        });
      }

      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Make sure user owns the comment or the post
    if (
      comment.user.toString() !== req.user.id &&
      post.user.toString() !== req.user.id
    ) {
      console.log("Not authorized to delete comment");
      return res.status(401).json({
        success: false,
        message: "Not authorized to delete this comment",
      });
    }

    // Find all replies to this comment
    const repliesToRemove = post.comments.filter(
      (c) => c.replyTo && c.replyTo.toString() === req.params.commentId
    );

    // Remove the comment
    post.comments.pull(req.params.commentId);

    // Remove all replies
    for (const reply of repliesToRemove) {
      post.comments.pull(reply._id);
    }

    await post.save();

    // Delete any notifications related to this comment
    await Notification.deleteMany({ comment: req.params.commentId });

    // Also delete notifications for replies
    for (const reply of repliesToRemove) {
      await Notification.deleteMany({ comment: reply._id });
    }

    console.log("Comment and related replies deleted successfully");

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while deleting the comment",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
