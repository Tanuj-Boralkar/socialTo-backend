const router = require("express").Router()
const c = require("../controllers/authController")
const a = require("../utils/asyncHandler")
const { protect } = require("../middleware/authMiddleware")
const upload = require("../middleware/uploadMiddleware")
const { rateLimit } = require("express-rate-limit")
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Try again later.",
  },
});
router.post("/register", authLimit, a(c.register));
router.post("/login", authLimit, a(c.login));
router.post("/refresh", authLimit, a(c.refresh));
router.post("/logout", protect, a(c.logout));
router.get("/me", protect, a(c.me));
router.put("/password", protect, authLimit, a(c.changePassword));
module.exports = router;