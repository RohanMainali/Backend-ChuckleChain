const Notification = require("../models/Notification");
const User = require("../models/User");
const Post = require("../models/Post");

// @desc    Get all notifications for the current user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    console.log(
      `Fetching notifications for user ${req.user.id}, page ${
        req.query.page || 1
      }, limit ${req.query.limit || 20}`
    );

    // Add pagination
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Count total notifications for debugging
    const totalCount = await Notification.countDocuments({
      recipient: req.user.id,
    });
    console.log(`Total notifications for user: ${totalCount}`);

    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "sender",
        select: "username profilePicture",
      })
      .populate({
        path: "post",
        select: "text",
      });

    console.log(`Retrieved ${notifications.length} notifications`);

    // Check which users the current user is following
    const currentUser = await User.findById(req.user.id);
    const followingIds = currentUser.following.map((id) => id.toString());

    // Map the notifications to the expected format with null checks
    const formattedNotifications = notifications.map((notification) => {
      // Check if sender exists, if not provide default values
      const sender = notification.sender || {
        _id: "deleted-user",
        username: "Deleted User",
        profilePicture: "/placeholder.svg?height=50&width=50",
      };

      // Check if the current user is following the sender
      const userFollowedBack = followingIds.includes(sender._id.toString());

      return {
        id: notification._id,
        type: notification.type,
        user: {
          id: sender._id || "deleted-user",
          username: sender.username || "Deleted User",
          profilePicture:
            sender.profilePicture || "/placeholder.svg?height=50&width=50",
        },
        content: notification.content || "",
        postId: notification.post ? notification.post._id : null,
        postText: notification.post ? notification.post.text : null,
        commentId: notification.comment || null,
        read: notification.read || false,
        timestamp: notification.createdAt,
        userFollowedBack: userFollowedBack,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedNotifications,
      meta: {
        page,
        limit,
        total: totalCount,
        hasMore: skip + notifications.length < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message:
        error.message || "An error occurred while fetching notifications",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Make sure notification belongs to current user
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to update this notification",
      });
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({
      success: true,
      data: {
        id: notification._id,
        read: notification.read,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { read: true }
    );

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

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Make sure notification belongs to current user
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to delete this notification",
      });
    }

    await notification.deleteOne();

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

// @desc    Get unread notification count
// @route   GET /api/notifications/count
// @access  Private
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });

    res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add a new function to clean up orphaned notifications
exports.cleanupOrphanedNotifications = async () => {
  try {
    console.log("Starting cleanup of orphaned notifications");

    // Find notifications with non-existent recipients
    const notifications = await Notification.find({});
    let deleteCount = 0;

    for (const notification of notifications) {
      // Check if recipient exists
      const recipientExists = await User.exists({
        _id: notification.recipient,
      });

      // Check if sender exists
      const senderExists = await User.exists({ _id: notification.sender });

      // Check if associated post exists (if there is one)
      let postExists = true;
      if (notification.post) {
        postExists = await Post.exists({ _id: notification.post });
      }

      // Delete notification if any related entity doesn't exist
      if (!recipientExists || !senderExists || !postExists) {
        await Notification.findByIdAndDelete(notification._id);
        deleteCount++;
      }
    }

    console.log(`Cleaned up ${deleteCount} orphaned notifications`);
    return { success: true, deletedCount: deleteCount };
  } catch (error) {
    console.error("Error cleaning up orphaned notifications:", error);
    return { success: false, error: error.message };
  }
};

// Add a scheduled cleanup route that can be called periodically
exports.runCleanup = async (req, res) => {
  try {
    const result = await this.cleanupOrphanedNotifications();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
