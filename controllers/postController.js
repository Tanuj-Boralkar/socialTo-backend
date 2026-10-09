const { z } = require("zod");
const Post = require("../models/Post");
const User = require("../models/User");
const Comment = require("../models/Comment");
const Notification = require("../models/Notification");
const { ok, fail, page } = require("../utils/http");
const { visibleUserIds, assertView, authorFields } = require("../utils/access");
const { uploadMany, removeMedia } = require("../utils/cloudinaryUpload");
const { notify, mentions } = require("../utils/notifications");
const fields = z.object({
  caption: z.string().max(2200).default(""),
  location: z.string().max(100).default(""),
});
const load = (exports.load = async (id, viewer) => {
  const p = await Post.findById(id).populate("user", authorFields);
  if (!p) throw fail(404, "Post not found");
  assertView(p.user, viewer);
  return p;
});
exports.list = async (req, res) => {
  const { page: p, limit } = page(req);
  const visible = await visibleUserIds(req.user);
  const q = { user: { $in: visible } };
  if (req.query.user) {
    q.user = { $in: visible.filter((x) => String(x) === req.query.user) };
  } else if (req.query.mode === "feed")
    q.user = {
      $in: visible.filter(
        (x) =>
          String(x) === String(req.user._id) ||
          req.user.following.some((f) => String(f) === String(x)),
      ),
    };
  if (req.query.mode === "saved") q._id = { $in: req.user.savedPosts };
  if (req.query.tagged) {
    q.taggedUsers = req.query.tagged;
  }
  let query = Post.find(q)
    .populate("user", authorFields)
    .sort({ createdAt: -1 });
  if (req.query.mode === "trending") {
    const ids = await Post.aggregate([
      { $match: q },
      { $addFields: { score: { $size: "$likes" } } },
      { $sort: { score: -1, createdAt: -1 } },
      { $skip: (p - 1) * limit },
      { $limit: limit + 1 },
    ]);
    const rows = await Post.populate(ids, {
      path: "user",
      select: authorFields,
    });
    return ok(res, {
      posts: rows.slice(0, limit),
      hasMore: rows.length > limit,
    });
  }
  const rows = await query.skip((p - 1) * limit).limit(limit + 1);
  ok(res, { posts: rows.slice(0, limit), hasMore: rows.length > limit });
};
exports.get = async (req, res) =>
  ok(res, { post: await load(req.params.id, req.user) });
exports.create = async (req, res) => {
  const data = fields.parse(req.body);
  if (!req.files?.length) throw fail(400, "Choose at least one image or video");
  const media = await uploadMany(req.files);
  let p;
  try {
    p = await Post.create({
      ...data,
      user: req.user._id,
      media,
      mediaType: media.length > 1 ? "carousel" : media[0].type,
    });
  } catch (e) {
    await removeMedia(media).catch(console.error);
    throw e;
  }
  p.taggedUsers = await mentions(req, p.caption, { post: p._id });
  await p.save();
  await p.populate("user", authorFields);
  ok(res, { post: p }, "Post published", 201);
};
exports.update = async (req, res) => {
  const p = await load(req.params.id, req.user);
  if (!p.user._id.equals(req.user._id))
    throw fail(403, "You can only edit your own posts");
  Object.assign(p, fields.parse(req.body));
  p.taggedUsers = await mentions(req, p.caption, { post: p._id });
  await p.save();
  ok(res, { post: p });
};
exports.remove = async (req, res) => {
  const p = await load(req.params.id, req.user);
  if (!p.user._id.equals(req.user._id))
    throw fail(403, "You can only delete your own posts");
  await removeMedia(p.media);
  await Promise.all([
    Comment.deleteMany({ post: p._id }),
    Notification.deleteMany({ post: p._id }),
    User.updateMany({ savedPosts: p._id }, { $pull: { savedPosts: p._id } }),
  ]);
  await p.deleteOne();
  ok(res);
};
exports.like = async (req, res) => {
  const p = await load(req.params.id, req.user);
  const liked = req.method === "PUT";
  const result = await Post.updateOne(
    { _id: p._id, ...(liked ? { likes: { $ne: req.user._id } } : {}) },
    { [liked ? "$addToSet" : "$pull"]: { likes: req.user._id } },
  );
  if (liked && result.modifiedCount)
    await notify(req, p.user._id, "like", { post: p._id });
  ok(res, { post: await load(p._id, req.user) });
};
exports.save = async (req, res) => {
  await load(req.params.id, req.user);
  await User.updateOne(
    { _id: req.user._id },
    {
      [req.method === "PUT" ? "$addToSet" : "$pull"]: {
        savedPosts: req.params.id,
      },
    },
  );
  ok(res, { saved: req.method === "PUT" });
};
