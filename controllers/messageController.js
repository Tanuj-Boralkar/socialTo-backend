const { z } = require("zod");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { ok, fail, page } = require("../utils/http");
const { uploadFile, removeMedia } = require("../utils/cloudinaryUpload");
const { canView } = require("../utils/access");
const { notify } = require("../utils/notifications");
const member = (exports.member = async (id, userId) => {
  const c = await Conversation.findOne({ _id: id, participants: userId });
  if (!c) throw fail(404, "Conversation not found");
  return c;
});
exports.list = async (req, res) => {
  const { page: p, limit } = page(req);
  const conversations = await Conversation.find({ participants: req.user._id })
    .populate("participants", "username fullName profilePicture")
    .populate("lastMessage")
    .sort({ updatedAt: -1 })
    .skip((p - 1) * limit)
    .limit(limit + 1);
  ok(res, {
    conversations: conversations.slice(0, limit),
    hasMore: conversations.length > limit,
  });
};
exports.start = async (req, res) => {
  const { userId } = z
    .object({ userId: z.string().regex(/^[a-f0-9]{24}$/i) })
    .parse(req.body);
  if (userId === String(req.user._id)) throw fail(400, "Choose another user");
  const u = await User.findById(userId);
  if (!u) throw fail(404, "User not found");
  if (!canView(u, req.user))
    throw fail(403, "Follow this private account before messaging");
  const pairKey = [String(req.user._id), userId].sort().join(":");
  let c;
  try {
    c = await Conversation.findOneAndUpdate(
      { pairKey },
      { $setOnInsert: { participants: [req.user._id, userId], pairKey } },
      { upsert: true, new: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
    c = await Conversation.findOne({ pairKey });
  }
  await c.populate("participants", "username fullName profilePicture");
  ok(res, { conversation: c });
};
exports.history = async (req, res) => {
  const c = await member(req.params.id, req.user._id);
  await c.populate("participants", "username fullName profilePicture");
  const { page: p, limit } = page(req);
  const messages = await Message.find({ conversation: c._id })
    .sort({ createdAt: -1 })
    .skip((p - 1) * limit)
    .limit(limit + 1);
  ok(res, {
    messages: messages.slice(0, limit).reverse(),
    hasMore: messages.length > limit,
    conversation: c,
  });
};
exports.send = async (req, res) => {
  const c = await member(req.params.id, req.user._id);
  const { text } = z
    .object({ text: z.string().trim().max(4000).default("") })
    .parse(req.body);
  if (!text && !req.file) throw fail(400, "Write a message or select an image");
  const otherId = c.participants.find((x) => !x.equals(req.user._id));
  const other = await User.findById(otherId);
  if (!other || !canView(other, req.user))
    throw fail(403, "You cannot message this private account");
  if (req.file && !req.file.mimetype.startsWith("image/"))
    throw fail(400, "Choose an image");
  const image = req.file ? await uploadFile(req.file) : undefined;
  let m;
  try {
    m = await Message.create({
      conversation: c._id,
      sender: req.user._id,
      text,
      image,
      seenBy: [req.user._id],
    });
  } catch (e) {
    if (image) await removeMedia(image).catch(console.error);
    throw e;
  }
  c.lastMessage = m._id;
  await c.save();
  for (const id of c.participants)
    req.app.get("io")?.to(`user:${id}`).emit("message", m);
  await notify(req, otherId, "message", { conversation: c._id });
  ok(res, { message: m }, "Message sent", 201);
};
exports.seen = async (req, res) => {
  const c = await member(req.params.id, req.user._id);
  await Message.updateMany(
    { conversation: c._id, seenBy: { $ne: req.user._id } },
    { $addToSet: { seenBy: req.user._id } },
  );
  for (const id of c.participants)
    req.app
      .get("io")
      ?.to(`user:${id}`)
      .emit("seen", {
        conversation: String(c._id),
        userId: String(req.user._id),
      });
  ok(res);
};
