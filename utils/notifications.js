const Notification = require("../models/Notification")

const User = require("../models/User")
exports.notify = async (req, recipient, type, extra = {}) => {
  if (String(recipient) === String(req.user._id)) return
  const n = await Notification.create({
    recipient,
    actor: req.user._id,
    type,
    ...extra,
  })
  await n.populate("actor", "username fullName profilePicture")
  req.app.get("io")?.to(`user:${recipient}`).emit("notification", n)
}
exports.mentions = async (req, text, extra) => {
  const names = [
    ...new Set(
      (text.match(/@([a-z0-9_]{3,24})\b/gi) || []).map((x) =>
        x.slice(1).toLowerCase(),
      ),
    ),
  ].slice(0, 20)
  const users = await User.find({ username: { $in: names } })
  for (const u of users) await exports.notify(req, u._id, "mention", extra)
  return users.map((x) => x._id)
}