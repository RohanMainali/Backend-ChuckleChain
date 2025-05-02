const express = require("express")
const { submitAppeal, getAppeals, getAppealsCount, reviewAppeal, checkUserAppeal } = require("../controllers/appeals")
const { protect } = require("../middleware/auth")
const { isAdmin } = require("../middleware/admin")

const router = express.Router()

// Public routes
router.post("/submit", submitAppeal)
router.get("/check/:username", checkUserAppeal)

// Admin routes - add error handling middleware
router.use(protect)
router.use(isAdmin)

router.get("/", getAppeals)
router.get("/count", getAppealsCount)
router.put("/:id", reviewAppeal)

// Export the router
module.exports = router
