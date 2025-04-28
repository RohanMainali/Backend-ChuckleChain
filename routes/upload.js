const express = require("express")
const { uploadImage } = require("../controllers/upload")
const { protect } = require("../middleware/auth")

const router = express.Router()

router.post("/", protect, uploadImage)

module.exports = router

