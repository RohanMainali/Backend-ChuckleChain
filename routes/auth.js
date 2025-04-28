const express = require("express")
const { signup, login, logout, getMe, adminSignup } = require("../controllers/auth")
const { protect } = require("../middleware/auth")
const { verifyAdminToken } = require("../middleware/admin")

const router = express.Router()

router.post("/signup", signup)
router.post("/admin-signup", verifyAdminToken, adminSignup)
router.post("/login", login)
router.get("/logout", logout)
router.get("/me", protect, getMe)

module.exports = router

