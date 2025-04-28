const User = require("../models/User");
const Post = require("../models/Post");
const Notification = require("../models/Notification");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const { emitNewNotification } = require("../socket");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// @desc    Get user profile
// @route   GET /api/users/:username
// @access  Public
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get user's posts
    const posts = await Post.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "user",
        select: "username profilePicture",
      })
      .populate({
        path: "comments.user",
        select: "username profilePicture",
      });

    // Check if the logged-in user is following this user
    let isFollowing = false;
    if (req.user) {
      isFollowing = req.user.following.some(
        (id) => id.toString() === user._id.toString()
      );
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          profilePicture: user.profilePicture,
          fullName: user.fullName,
          bio: user.bio,
          website: user.website,
          followers: user.followers.length,
          following: user.following.length,
          isFollowing,
        },
        posts: posts.map((post) => ({
          id: post._id,
          text: post.text,
          image: post.image,
          createdAt: post.createdAt,
          likes: post.likeCount,
          isLiked: req.user ? post.likes.includes(req.user._id) : false,
          comments: post.comments.map((comment) => ({
            id: comment._id,
            user: comment.user.username,
            profilePicture: comment.user.profilePicture,
            text: comment.text,
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
      },
    });
  } catch (error) {
    console.error("Error in getUserProfile:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get current user's profile
// @route   GET /api/users/me
// @access  Private
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Get user's posts
    const posts = await Post.find({ user: user._id })
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
      data: {
        user: {
          id: user._id,
          username: user.username,
          profilePicture: user.profilePicture,
          fullName: user.fullName,
          bio: user.bio,
          website: user.website,
          followers: user.followers.length,
          following: user.following.length,
          isFollowing: false, // Always false for own profile
          currentStreak: user.currentStreak || 0,
          maxStreak: user.maxStreak || 0,
          lastStreakUpdate: user.lastStreakUpdate,
        },
        posts: posts.map((post) => ({
          id: post._id,
          text: post.text,
          image: post.image,
          createdAt: post.createdAt,
          likes: post.likeCount,
          isLiked: post.likes.includes(user._id),
          iked: post.likes.includes(user._id),
          comments: post.comments.map((comment) => ({
            id: comment._id,
            user: comment.user.username,
            profilePicture: comment.user.profilePicture,
            text: comment.text,
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
      },
    });
  } catch (error) {
    console.error("Error in getMyProfile:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/me
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, bio, website, profilePicture } = req.body;

    // Build update object
    const updateFields = {};
    if (fullName !== undefined) updateFields.fullName = fullName;
    if (bio !== undefined) updateFields.bio = bio;
    if (website !== undefined) updateFields.website = website;
    if (profilePicture !== undefined)
      updateFields.profilePicture = profilePicture;

    const user = await User.findByIdAndUpdate(req.user.id, updateFields, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error in updateProfile:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Change user password
// @route   PUT /api/users/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide current and new password",
      });
    }

    // Get user with password
    const user = await User.findById(req.user.id).select("+password");

    // Check if current password matches
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while changing password",
    });
  }
};

// @desc    Delete user account
// @route   DELETE /api/users/me
// @access  Private
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Start a transaction to ensure all operations succeed or fail together
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Delete user's posts
      await Post.deleteMany({ user: userId }, { session });

      // 2. Delete user's comments on other posts
      await Post.updateMany(
        { "comments.user": userId },
        { $pull: { comments: { user: userId } } },
        { session }
      );

      // 3. Delete user's likes on posts
      await Post.updateMany(
        { likes: userId },
        { $pull: { likes: userId } },
        { session }
      );

      // 4. Delete notifications related to the user (both sent and received)
      await Notification.deleteMany(
        { $or: [{ recipient: userId }, { sender: userId }] },
        { session }
      );

      // 5. Delete user's messages
      await Message.deleteMany({ senderId: userId }, { session });

      // 6. Delete or update conversations
      // Find all conversations where the user is a participant
      const conversations = await Conversation.find(
        { participants: userId },
        null,
        { session }
      );

      // Delete all conversations where the user is a participant
      await Conversation.deleteMany({ participants: userId }, { session });

      // 7. Remove user from followers/following lists AND update follower/following counts
      // Find users who this user follows
      const followingUsers = await User.find(
        { followers: userId },
        { _id: 1 },
        { session }
      );

      // Remove the user from their followers list
      await User.updateMany(
        { followers: userId },
        { $pull: { followers: userId } },
        { session }
      );

      // Find users who follow this user
      const followerUsers = await User.find(
        { following: userId },
        { _id: 1 },
        { session }
      );

      // Remove the user from their following list
      await User.updateMany(
        { following: userId },
        { $pull: { following: userId } },
        { session }
      );

      // 8. Remove user from tagged posts
      await Post.updateMany(
        { taggedUsers: userId },
        { $pull: { taggedUsers: userId } },
        { session }
      );

      // 9. Finally, delete the user
      await User.findByIdAndDelete(userId, { session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error) {
      // If an error occurs, abort the transaction
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while deleting account",
    });
  }
};

// @desc    Follow/Unfollow a user
// @route   PUT /api/users/:username/follow
// @access  Private
exports.followUser = async (req, res) => {
  try {
    // Check if user exists
    const userToFollow = await User.findOne({ username: req.params.username });

    if (!userToFollow) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is trying to follow themselves
    if (userToFollow._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself",
      });
    }

    // Check if already following
    const isFollowing = req.user.following.some(
      (id) => id.toString() === userToFollow._id.toString()
    );

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // If already following, unfollow
      if (isFollowing) {
        await User.findByIdAndUpdate(
          userToFollow._id,
          { $pull: { followers: req.user.id } },
          { session }
        );

        await User.findByIdAndUpdate(
          req.user.id,
          { $pull: { following: userToFollow._id } },
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          success: true,
          data: {
            isFollowing: false,
          },
        });
      }

      // If not following, follow
      await User.findByIdAndUpdate(
        userToFollow._id,
        { $addToSet: { followers: req.user.id } },
        { session }
      );

      await User.findByIdAndUpdate(
        req.user.id,
        { $addToSet: { following: userToFollow._id } },
        { session }
      );

      // Create a notification for the user being followed
      const notification = new Notification({
        recipient: userToFollow._id,
        sender: req.user.id,
        type: "follow",
      });

      await notification.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Populate the sender information for the notification
      await notification.populate({
        path: "sender",
        select: "username profilePicture",
      });

      // Emit the notification to the user being followed
      const io = req.app.get("io");
      if (io) {
        emitNewNotification(io, userToFollow._id.toString(), {
          id: notification._id,
          type: notification.type,
          user: {
            id: notification.sender._id,
            username: notification.sender.username,
            profilePicture: notification.sender.profilePicture,
          },
          read: notification.read,
          timestamp: notification.createdAt,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          isFollowing: true,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get top users
// @route   GET /api/users/top
// @access  Private
exports.getTopUsers = async (req, res) => {
  try {
    const timeFrame = req.query.timeFrame || "day";

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
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    // Aggregate to find users with the most likes on their posts
    const topUsers = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$user",
          likeCount: { $sum: { $size: "$likes" } },
          postCount: { $sum: 1 },
        },
      },
      {
        $sort: { likeCount: -1 },
      },
      {
        $limit: 5,
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: "$userDetails",
      },
      {
        $project: {
          _id: 1,
          username: "$userDetails.username",
          profilePicture: "$userDetails.profilePicture",
          likeCount: 1,
          postCount: 1,
        },
      },
    ]);

    // If no users found, return the current user
    if (topUsers.length === 0) {
      const user = await User.findById(req.user.id);
      const posts = await Post.find({ user: user._id });

      return res.status(200).json({
        success: true,
        data: [
          {
            _id: user._id,
            username: user.username,
            profilePicture: user.profilePicture,
            likeCount: posts.reduce((sum, post) => sum + post.likes.length, 0),
            postCount: posts.length,
          },
        ],
      });
    }

    res.status(200).json({
      success: true,
      data: topUsers,
    });
  } catch (error) {
    console.error("Error in getTopUsers:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user followers
// @route   GET /api/users/:username/followers
// @access  Private
exports.getUserFollowers = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate(
      "followers",
      "_id username profilePicture"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if the current user is following each follower
    const followersWithStatus = user.followers.map((follower) => {
      const isFollowing = req.user.following.some(
        (id) => id.toString() === follower._id.toString()
      );
      return {
        id: follower._id,
        username: follower.username,
        profilePicture: follower.profilePicture,
        isFollowing: isFollowing || follower._id.toString() === req.user.id,
      };
    });

    res.status(200).json({
      success: true,
      data: followersWithStatus,
    });
  } catch (error) {
    console.error("Error fetching followers:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user following
// @route   GET /api/users/:username/following
// @access  Private
exports.getUserFollowing = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate(
      "following",
      "_id username profilePicture"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if the current user is following each user
    const followingWithStatus = user.following.map((followedUser) => {
      const isFollowing = req.user.following.some(
        (id) => id.toString() === followedUser._id.toString()
      );
      return {
        id: followedUser._id,
        username: followedUser.username,
        profilePicture: followedUser.profilePicture,
        isFollowing: isFollowing || followedUser._id.toString() === req.user.id,
      };
    });

    res.status(200).json({
      success: true,
      data: followingWithStatus,
    });
  } catch (error) {
    console.error("Error fetching following:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add this function to track user streaks
exports.updateUserStreak = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Get the current date (without time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get the last streak update date
    const lastStreakUpdate = user.lastStreakUpdate
      ? new Date(user.lastStreakUpdate)
      : null;
    lastStreakUpdate?.setHours(0, 0, 0, 0);

    // If this is the first post or the last update was not today
    if (!lastStreakUpdate || lastStreakUpdate.getTime() !== today.getTime()) {
      // Check if the last update was yesterday
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (
        lastStreakUpdate &&
        lastStreakUpdate.getTime() === yesterday.getTime()
      ) {
        // If the last update was yesterday, increment the streak
        user.currentStreak = (user.currentStreak || 0) + 1;
      } else if (
        !lastStreakUpdate ||
        lastStreakUpdate.getTime() < yesterday.getTime()
      ) {
        // If the last update was before yesterday, reset the streak
        user.currentStreak = 1;
      }

      // Update the last streak update date
      user.lastStreakUpdate = today;

      // Update the max streak if needed
      if (!user.maxStreak || user.currentStreak > user.maxStreak) {
        user.maxStreak = user.currentStreak;
      }

      await user.save();
    }
  } catch (error) {
    console.error("Error updating user streak:", error);
  }
};

// @desc    Reset followers and following for debugging
// @route   POST /api/users/reset-relationships
// @access  Private (admin only)
exports.resetRelationships = async (req, res) => {
  try {
    // This is a dangerous operation, so we'll add some safety checks
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to perform this action",
      });
    }

    // Reset all users' followers and following arrays
    await User.updateMany({}, { $set: { followers: [], following: [] } });

    res.status(200).json({
      success: true,
      message: "All user relationships have been reset",
    });
  } catch (error) {
    console.error("Error resetting relationships:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Debug user relationships
// @route   GET /api/users/debug-relationships
// @access  Private
exports.debugRelationships = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("followers", "username")
      .populate("following", "username");

    res.status(200).json({
      success: true,
      data: {
        username: user.username,
        followers: user.followers,
        following: user.following,
        followerCount: user.followers.length,
        followingCount: user.following.length,
      },
    });
  } catch (error) {
    console.error("Error debugging relationships:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add this function to the exports at the end of the file

// @desc    Search users
// @route   GET /api/users/search
// @access  Private
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Search for users by username or fullName
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: "i" } },
        { fullName: { $regex: q, $options: "i" } },
      ],
      _id: { $ne: req.user.id }, // Exclude the current user
    })
      .select("_id username profilePicture fullName")
      .limit(10);

    res.status(200).json({
      success: true,
      data: users.map((user) => ({
        id: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
        fullName: user.fullName || "",
      })),
    });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add a new endpoint to update user settings

// @desc    Update user settings
// @route   PUT /api/users/settings
// @access  Private
exports.updateUserSettings = async (req, res) => {
  try {
    const {
      showOnlineStatus,
      showReadReceipts,
      pushNotifications,
      emailNotifications,
      contentFilter,
      profileVisibility,
      allowTagging,
    } = req.body;

    // Build update object with only the fields that were provided
    const settingsUpdate = {};

    if (showOnlineStatus !== undefined) {
      settingsUpdate["settings.showOnlineStatus"] = showOnlineStatus;
    }

    if (showReadReceipts !== undefined) {
      settingsUpdate["settings.showReadReceipts"] = showReadReceipts;
    }

    if (pushNotifications !== undefined) {
      settingsUpdate["settings.pushNotifications"] = pushNotifications;
    }

    if (emailNotifications) {
      if (emailNotifications.likes !== undefined) {
        settingsUpdate["settings.emailNotifications.likes"] =
          emailNotifications.likes;
      }
      if (emailNotifications.comments !== undefined) {
        settingsUpdate["settings.emailNotifications.comments"] =
          emailNotifications.comments;
      }
      if (emailNotifications.followers !== undefined) {
        settingsUpdate["settings.emailNotifications.followers"] =
          emailNotifications.followers;
      }
      if (emailNotifications.messages !== undefined) {
        settingsUpdate["settings.emailNotifications.messages"] =
          emailNotifications.messages;
      }
    }

    if (contentFilter) {
      settingsUpdate["settings.contentFilter"] = contentFilter;
    }

    if (profileVisibility) {
      settingsUpdate["settings.profileVisibility"] = profileVisibility;
    }

    if (allowTagging !== undefined) {
      settingsUpdate["settings.allowTagging"] = allowTagging;
    }

    // Update the user's settings
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: settingsUpdate },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: {
        settings: user.settings,
      },
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user settings
// @route   GET /api/users/settings
// @access  Private
exports.getUserSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        settings: user.settings,
      },
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
