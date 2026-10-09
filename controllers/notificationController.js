const Notification = require("../models/Notification");
const { ok, page } = require("../utils/http");
exports.list = async (req, res) => {
  const { page: p, limit } = page(req);
  const notifications = await Notification.find({ recipient: req.user._id })
    .populate("actor", "username fullName profilePicture")
    .sort({ createdAt: -1 })
    .skip((p - 1) * limit)
    .limit(limit + 1);
  const unread = await Notification.countDocuments({
    recipient: req.user._id,
    read: false,
  });
  ok(res, {
    notifications: notifications.slice(0, limit),
    hasMore: notifications.length > limit,
    unread,
  });
};
exports.read = async (req, res) => {
  await Notification.updateMany(
    {
      recipient: req.user._id,
      ...(req.params.id ? { _id: req.params.id } : {}),
    },
    { $set: { read: true } },
  );
  ok(res);
};
