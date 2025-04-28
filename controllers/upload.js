const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// @desc    Upload image to Cloudinary
// @route   POST /api/upload
// @access  Private
exports.uploadImage = async (req, res) => {
  try {
    if (!req.body.image) {
      return res.status(400).json({
        success: false,
        message: "Please provide an image",
      });
    }

    const uploadOptions = {
      folder: "chucklechain",
      resource_type: "auto",
    };

    // If this is a profile picture upload
    if (req.body.isProfilePicture) {
      // Use crop and face detection for profile pictures to maintain quality
      uploadOptions.transformation = [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto:good" }, // Maintain good quality
      ];
      // Add a specific folder for profile pictures
      uploadOptions.folder = "chucklechain/profiles";
    } else if (req.body.isMessageImage) {
      // For message images, preserve aspect ratio but optimize for messaging
      uploadOptions.transformation = [
        { width: 800, height: 800, crop: "limit" },
        { quality: "auto:good" }, // Maintain good quality
      ];
      // Add a specific folder for message images
      uploadOptions.folder = "chucklechain/messages";
      console.log("Uploading message image to Cloudinary");
    } else if (req.body.preserveAspectRatio) {
      // For other images that need to preserve aspect ratio
      uploadOptions.transformation = [
        { width: 400, height: 400, crop: "limit" },
      ];
    }

    console.log("Upload options:", uploadOptions);

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(
      req.body.image,
      uploadOptions
    );

    console.log("Cloudinary upload result:", {
      url: result.secure_url,
      public_id: result.public_id,
    });

    res.status(200).json({
      success: true,
      data: {
        url: result.secure_url,
        public_id: result.public_id,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading image",
    });
  }
};
