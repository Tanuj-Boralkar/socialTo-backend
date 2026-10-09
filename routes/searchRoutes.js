const router = require("express").Router();
const c = require("../controllers/searchController");
const a = require("../utils/asyncHandler");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
router.use(protect);
router.get("/", a(c.search));
module.exports = router;