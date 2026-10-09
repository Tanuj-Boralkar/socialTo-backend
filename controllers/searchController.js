const User = require("../models/User")
const { ok, page } = require("../utils/http")
exports.search = async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .slice(0, 60)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  if (!q) return ok(res, { users: [], hasMore: false })
  const { page: p, limit } = page(req)
  const users = await User.find({
    $or: [
      { username: { $regex: q, $options: "i" } },
      { fullName: { $regex: q, $options: "i" } },
    ],
  })
    .select("username fullName profilePicture isPrivate")
    .skip((p - 1) * limit)
    .limit(limit + 1)
  ok(res, { users: users.slice(0, limit), hasMore: users.length > limit })
}
