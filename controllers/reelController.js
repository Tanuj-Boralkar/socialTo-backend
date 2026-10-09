const { z } = require("zod");
const Reel = require("../models/Reel");
const User = require("../models/User");
const Comment = require("../models/Comment");
const Notification = require("../models/Notification");
const { ok, fail, page } = require("../utils/http");
const { visibleUserIds, assertView, authorFields } = require("../utils/access");
const { uploadFile, removeMedia } = require("../utils/cloudinaryUpload");
const { notify, mentions } = require("../utils/notifications");
const fields = z.object({
  caption: z.string().max(2200).default(""),
  audio: z.string().max(100).default("Original audio"),
});
const load = (exports.load = async (id, u) => {
  const r = await Reel.findById(id).populate("user", authorFields);
  if (!r) throw fail(404, "Reel not found");
  assertView(r.user, u);
  return r;
});
exports.list = async (req, res) => {
  const { page: p, limit } = page(req);
  let visible = await visibleUserIds(req.user);
  if (req.query.user)
    visible = visible.filter((x) => String(x) === req.query.user);
  const q = { user: { $in: visible } };
  if (req.query.mode === "saved") q._id = { $in: req.user.savedReels };
  const reels = await Reel.find(q)
    .populate("user", authorFields)
    .sort({ createdAt: -1 })
    .skip((p - 1) * limit)
    .limit(limit + 1);
  ok(res, { reels: reels.slice(0, limit), hasMore: reels.length > limit });
};
exports.get = async (req, res) =>
  ok(res, { reel: await load(req.params.id, req.user) });
exports.create = async (req, res) => {
  const data = fields.parse(req.body);
  if (!req.file?.mimetype.startsWith("video/"))
    throw fail(400, "Choose a video");
  const media = await uploadFile(req.file);
  let r;
  try {
    r = await Reel.create({ ...data, user: req.user._id, media });
  } catch (e) {
    await removeMedia(media).catch(console.error);
    throw e;
  }
  await mentions(req, r.caption, { reel: r._id });
  await r.populate("user", authorFields);
  ok(res, { reel: r }, "Reel published", 201);
};
exports.like = async (req, res) => {
  const r = await load(req.params.id, req.user);
  const liked = req.method === "PUT";
  const result = await Reel.updateOne(
    { _id: r._id, ...(liked ? { likes: { $ne: req.user._id } } : {}) },
    { [liked ? "$addToSet" : "$pull"]: { likes: req.user._id } },
  );
  if (liked && result.modifiedCount)
    await notify(req, r.user._id, "like", { reel: r._id });
  ok(res, { reel: await load(r._id, req.user) });
};
exports.save = async (req, res) => {
  await load(req.params.id, req.user);
  await User.updateOne(
    { _id: req.user._id },
    {
      [req.method === "PUT" ? "$addToSet" : "$pull"]: {
        savedReels: req.params.id,
      },
    },
  );
  ok(res, { saved: req.method === "PUT" });
};
exports.remove = async (req, res) => {
  const r = await load(req.params.id, req.user);
  if (!r.user._id.equals(req.user._id))
    throw fail(403, "You can only delete your own reels");
  await removeMedia(r.media);
  await Promise.all([
    Comment.deleteMany({ reel: r._id }),
    Notification.deleteMany({ reel: r._id }),
    User.updateMany({ savedReels: r._id }, { $pull: { savedReels: r._id } }),
  ]);
  await r.deleteOne();
  ok(res);
};
