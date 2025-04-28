const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const Post = require("../models/Post");
const { emitNewMessage } = require("../socket");
const mongoose = require("mongoose");

// @desc    Get all conversations for the current user
// @route   GET /api/messages/conversations
// @access  Private
exports.getConversations = async (req, res) => {
  try {
    // Find all conversations where the current user is a participant
    const conversations = await Conversation.find({
      participants: req.user.id,
    })
      .sort({ "lastMessage.timestamp": -1 })
      .populate({
        path: "participants",
        select: "username profilePicture",
      });

    // Format the conversations for the frontend
    const formattedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        // Get the other participant (not the current user)
        const otherParticipant = conversation.participants.find(
          (participant) => participant._id.toString() !== req.user.id
        );

        // Get messages for this conversation
        const messages = await Message.find({
          conversationId: conversation._id,
        })
          .sort({ timestamp: 1 })
          .populate({
            path: "senderId",
            select: "username profilePicture",
          });

        return {
          id: conversation._id,
          user: {
            id: otherParticipant._id,
            username: otherParticipant.username,
            profilePicture: otherParticipant.profilePicture,
          },
          messages: messages.map((message) => ({
            id: message._id,
            senderId: message.senderId._id,
            text: message.text,
            timestamp: message.timestamp,
            read: message.read,
            conversationId: message.conversationId,
            image: message.image,
            replyTo: message.replyTo,
            sharedPost: message.sharedPost,
          })),
          lastMessage: {
            text: conversation.lastMessage.text,
            timestamp: conversation.lastMessage.timestamp,
          },
        };
      })
    );

    res.status(200).json({
      success: true,
      data: formattedConversations,
    });
  } catch (error) {
    console.error("Error in getConversations:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get or create a conversation with another user
// @route   GET /api/messages/conversations/:userId
// @access  Private
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if the user exists
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if a conversation already exists between the two users
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user.id, userId] },
    }).populate({
      path: "participants",
      select: "username profilePicture",
    });

    // If no conversation exists, create a new one
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user.id, userId],
        lastMessage: {
          text: "",
          sender: req.user.id,
          timestamp: Date.now(),
        },
      });

      // Populate the participants
      await conversation.populate({
        path: "participants",
        select: "username profilePicture",
      });
    }

    // Get messages for this conversation
    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ timestamp: 1 })
      .populate({
        path: "senderId",
        select: "username profilePicture",
      });

    // Get the other participant (not the current user)
    const otherParticipant = conversation.participants.find(
      (participant) => participant._id.toString() !== req.user.id
    );

    res.status(200).json({
      success: true,
      data: {
        id: conversation._id,
        user: {
          id: otherParticipant._id,
          username: otherParticipant.username,
          profilePicture: otherParticipant.profilePicture,
        },
        messages: messages.map((message) => ({
          id: message._id,
          senderId: message.senderId._id,
          text: message.text,
          timestamp: message.timestamp,
          read: message.read,
          conversationId: message.conversationId,
          sharedPost: message.sharedPost,
          image: message.image,
          replyTo: message.replyTo,
        })),
        lastMessage: {
          text: conversation.lastMessage.text,
          timestamp: conversation.lastMessage.timestamp,
        },
      },
    });
  } catch (error) {
    console.error("Error in getOrCreateConversation:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Send a message in a conversation
// @route   POST /api/messages/:conversationId
// @access  Private
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text, image, replyToId } = req.body;

    console.log("Message data received:", {
      text,
      image: image ? "Image present" : "No image",
      replyToId,
    });

    // Check if the conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Check if the user is a participant in the conversation
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to send messages in this conversation",
      });
    }

    // Create the message
    const messageData = {
      conversationId,
      senderId: req.user.id,
      replyTo: replyToId,
    };

    // Handle text and image
    if (text && text.trim()) {
      messageData.text = text.trim();
    } else if (image) {
      messageData.text = "Sent an image";
    } else {
      messageData.text = "";
    }

    // Add image if present
    if (image) {
      messageData.image = image;
    }

    console.log("Creating message with data:", messageData);
    const message = await Message.create(messageData);

    // Update the conversation's last message
    conversation.lastMessage = {
      text: message.text || (message.image ? "📷 Image" : ""),
      sender: req.user.id,
      timestamp: Date.now(),
    };
    await conversation.save();

    // Get the other participant to emit the message to
    const otherParticipantId = conversation.participants.find(
      (participant) => participant.toString() !== req.user.id
    );

    // Emit the new message to the other participant
    const io = req.app.get("io");
    if (io) {
      const formattedMessage = {
        id: message._id,
        senderId: req.user.id,
        text: message.text,
        timestamp: message.timestamp,
        read: message.read,
        conversationId: message.conversationId,
        image: message.image,
        replyTo: message.replyTo,
      };
      emitNewMessage(io, otherParticipantId, formattedMessage);
    }

    res.status(201).json({
      success: true,
      data: {
        id: message._id,
        senderId: req.user.id,
        text: message.text,
        timestamp: message.timestamp,
        read: message.read,
        conversationId: message.conversationId,
        image: message.image,
        replyTo: message.replyTo,
      },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while sending the message",
    });
  }
};

// Update the markMessagesAsRead function to handle read receipts

// @desc    Mark messages as read
// @route   PUT /api/messages/:conversationId/read
// @access  Private
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Check if the conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Check if the user is a participant in the conversation
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to mark messages as read in this conversation",
      });
    }

    // Find all unread messages sent by the other user
    const unreadMessages = await Message.find({
      conversationId,
      senderId: { $ne: req.user.id },
      read: false,
    });

    // Mark all unread messages sent by the other user as read
    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: req.user.id },
        read: false,
      },
      { read: true }
    );

    // Get the other participant to notify them that their messages were read
    const otherParticipantId = conversation.participants.find(
      (participant) => participant.toString() !== req.user.id
    );

    // Emit socket event for each message that was marked as read
    const io = req.app.get("io");
    if (io && unreadMessages.length > 0) {
      const { isUserOnline } = require("../socket");

      // Only send read receipts if the other user is online
      if (isUserOnline(otherParticipantId)) {
        unreadMessages.forEach((message) => {
          io.to(otherParticipantId.toString()).emit("messageRead", {
            conversationId,
            messageId: message._id,
            readBy: req.user.id,
            timestamp: new Date(),
          });
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        markedAsRead: unreadMessages.length,
      },
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a message
// @route   DELETE /api/messages/:conversationId/:messageId
// @access  Private
exports.deleteMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    // Check if the conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Check if the user is a participant in the conversation
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to delete messages in this conversation",
      });
    }

    // Find the message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Check if the user is the sender of the message
    if (message.senderId.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to delete this message",
      });
    }

    // Delete the message
    await message.deleteOne();

    // Update the conversation's last message if this was the last message
    const lastMessage = await Message.findOne({ conversationId })
      .sort({ timestamp: -1 })
      .limit(1);

    if (lastMessage) {
      conversation.lastMessage = {
        text: lastMessage.text,
        sender: lastMessage.senderId,
        timestamp: lastMessage.timestamp,
      };
    } else {
      // If no messages left, set empty last message
      conversation.lastMessage = {
        text: "",
        sender: req.user.id,
        timestamp: Date.now(),
      };
    }
    await conversation.save();

    // Notify the other participant about the message deletion
    const io = req.app.get("io");
    if (io) {
      const otherParticipantId = conversation.participants.find(
        (participant) => participant.toString() !== req.user.id
      );

      if (otherParticipantId) {
        const socketId = io.sockets.adapter.rooms.get(
          otherParticipantId.toString()
        );
        if (socketId) {
          io.to(socketId).emit("messageDeleted", {
            messageId,
            conversationId,
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: messageId,
      },
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Share a post with multiple users
// @route   POST /api/messages/share
// @access  Private
exports.sharePost = async (req, res) => {
  try {
    console.log("Share request received:", req.body);
    const { postId, recipients } = req.body;

    // Validate required fields
    if (
      !postId ||
      !recipients ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a post ID and at least one recipient",
      });
    }

    // Check if the post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Get post details for sharing
    const postUser = await User.findById(post.user);
    if (!postUser) {
      return res.status(404).json({
        success: false,
        message: "Post creator not found",
      });
    }

    const postDetails = {
      id: post._id,
      text: post.text,
      image: post.image,
      user: {
        id: post.user,
        username: postUser.username,
      },
    };

    const results = [];

    // Share with each recipient
    for (const recipientId of recipients) {
      try {
        // Find or create conversation with this recipient
        let conversation = await Conversation.findOne({
          participants: { $all: [req.user.id, recipientId] },
        });

        if (!conversation) {
          conversation = await Conversation.create({
            participants: [req.user.id, recipientId],
            lastMessage: {
              text: "Shared a meme with you",
              sender: req.user.id,
              timestamp: Date.now(),
            },
          });
        }

        // Create a message with the shared post
        const message = await Message.create({
          conversationId: conversation._id,
          senderId: req.user.id,
          text: "Shared a meme with you",
          sharedPost: postDetails,
          timestamp: Date.now(),
        });

        // Update conversation's last message
        conversation.lastMessage = {
          text: "Shared a meme with you",
          sender: req.user.id,
          timestamp: Date.now(),
        };
        await conversation.save();

        results.push({
          recipientId,
          messageId: message._id,
          conversationId: conversation._id,
        });

        // Emit the new message to the recipient
        const io = req.app.get("io");
        if (io) {
          const formattedMessage = {
            id: message._id,
            senderId: req.user.id,
            text: "Shared a meme with you",
            timestamp: message.timestamp,
            read: false,
            conversationId: conversation._id,
            sharedPost: postDetails,
          };
          emitNewMessage(io, recipientId, formattedMessage);
        }
      } catch (error) {
        console.error(`Error sharing with recipient ${recipientId}:`, error);
        // Continue with other recipients even if one fails
      }
    }

    res.status(200).json({
      success: true,
      data: {
        sharedWith: results.length,
        results,
      },
    });
  } catch (error) {
    console.error("Error sharing post:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while sharing the post",
    });
  }
};

// @desc    Get unread messages count
// @route   GET /api/messages/unread-count
// @access  Private
exports.getUnreadMessagesCount = async (req, res) => {
  try {
    // Find all conversations where the current user is a participant
    const conversations = await Conversation.find({
      participants: req.user.id,
    });

    // Count conversations with unread messages
    let conversationsWithUnread = 0;
    let totalUnreadMessages = 0;

    for (const conversation of conversations) {
      const count = await Message.countDocuments({
        conversationId: conversation._id,
        senderId: { $ne: req.user.id },
        read: false,
      });

      if (count > 0) {
        conversationsWithUnread++;
        totalUnreadMessages += count;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        count: totalUnreadMessages,
        conversationsWithUnread: conversationsWithUnread,
      },
    });
  } catch (error) {
    console.error("Error counting unread messages:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
