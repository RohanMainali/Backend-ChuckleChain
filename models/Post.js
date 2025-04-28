// Update the Post schema to include taggedUsers
const mongoose = require("mongoose");

const MemeTextSchema = new mongoose.Schema({
  text: String,
  x: Number,
  y: Number,
  fontSize: Number,
  fontFamily: String,
  color: String,
  backgroundColor: String,
  textAlign: {
    type: String,
    enum: ["left", "center", "right"],
    default: "center",
  },
  bold: Boolean,
  italic: Boolean,
  underline: Boolean,
  uppercase: Boolean,
  outline: Boolean,
});

const CommentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Add fields for comment replies
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comment",
    default: null,
  },
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});

// Add a virtual for like count on comments
CommentSchema.virtual("likeCount").get(function () {
  return this.likes ? this.likes.length : 0;
});

const PostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: [
        "entertainment",
        "sports",
        "gaming",
        "technology",
        "fashion",
        "music",
        "tv",
        "other",
      ],
      default: "other",
    },
    memeTexts: [MemeTextSchema],
    captionPlacement: {
      type: String,
      enum: ["on-image", "whitespace"],
      default: "on-image",
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: [CommentSchema],
    hashtags: [String],
    taggedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for like count
PostSchema.virtual("likeCount").get(function () {
  return this.likes.length;
});

// Virtual for comment count
PostSchema.virtual("commentCount").get(function () {
  return this.comments.length;
});

// Add a pre-save hook to ensure all comments have valid user references
// Add this near the end of the file, before the model export
PostSchema.pre("save", async function (next) {
  try {
    // Check if any comments have invalid user references
    for (const comment of this.comments) {
      if (!comment.user) {
        console.warn(
          "Found comment without user reference, setting to system user"
        );
        // You could set this to a system user ID or handle it differently
        comment.user = this.user; // Default to post owner as fallback
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Post", PostSchema);
