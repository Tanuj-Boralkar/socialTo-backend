const { z } = require("zod");
const User = require("../models/User");
const Post = require("../models/Post");
const { ok, fail, page } = require("../utils/http");
const { publicUser, canView, assertView } = require("../utils/access");
const { uploadFile, removeMedia } = require("../utils/cloudinaryUpload");
const { notify } = require("../utils/notifications");
exports.profile = async (req, res) => {
  const u = await User.findOne({ username: req.params.username });
  if (!u) throw fail(404, "User not found");
  const visible = canView(u, req.user);
  const data = publicUser(u, req.user);
  if (!visible) {
    data.followers = [];
    data.following = [];
  }
  const requested = await User.exists({
    _id: u._id,
    followRequests: req.user._id,
  });
  ok(res, {
    user: data,
    canView: visible,
    requested: !!requested,
    counts: {
      posts: await Post.countDocuments({ user: u._id }),
      followers: u.followers.length,
      following: u.following.length,
    },
  });
};
exports.update = async (req, res) => {
  const data = z
    .object({
      fullName: z.string().trim().min(1).max(60).optional(),
      bio: z.string().max(160).optional(),
      website: z
        .string()
        .max(200)
        .refine(
          (x) => !x || /^https?:\/\//i.test(x),
          "Website must begin with https:// or http://",
        )
        .optional(),
      gender: z
        .enum(["", "Female", "Male", "Non-binary", "Prefer not to say"])
        .optional(),
      isPrivate: z
        .union([
          z.boolean(),
          z.enum(["true", "false"]).transform((x) => x === "true"),
        ])
        .optional(),
    })
    .parse(req.body);
  const u = await User.findById(req.user._id).select("+avatarPublicId");
  if (req.file) {
    if (!req.file.mimetype.startsWith("image/"))
      throw fail(400, "Avatar must be an image");
    const m = await uploadFile(req.file);
    const old = u.avatarPublicId;
    data.profilePicture = m.url;
    data.avatarPublicId = m.publicId;
    if (old) await removeMedia({ publicId: old }).catch(console.error);
  }
  Object.assign(u, data);
  await u.save();
  ok(res, { user: publicUser(u, u) });
};
exports.follow = async (req, res) => {
  if (String(req.user._id) === req.params.id)
    throw fail(400, "You cannot follow yourself");
  const target = await User.findById(req.params.id);
  if (!target) throw fail(404, "User not found");
  const exists = target.followers.some((x) => x.equals(req.user._id));
  if (exists) return ok(res, { following: true, requested: false });
  if (target.isPrivate) {
    const result = await User.updateOne(
      { _id: target._id, followRequests: { $ne: req.user._id } },
      { $addToSet: { followRequests: req.user._id } },
    );
    if (result.modifiedCount) await notify(req, target._id, "request");
    return ok(res, { following: false, requested: true });
  }
  await User.updateOne(
    { _id: target._id },
    { $addToSet: { followers: req.user._id } },
  );
  await User.updateOne(
    { _id: req.user._id },
    { $addToSet: { following: target._id } },
  );
  await notify(req, target._id, "follow");
  ok(res, { following: true, requested: false });
};
exports.unfollow = async (req, res) => {
  await User.updateOne(
    { _id: req.params.id },
    { $pull: { followers: req.user._id, followRequests: req.user._id } },
  );
  await User.updateOne(
    { _id: req.user._id },
    { $pull: { following: req.params.id } },
  );
  ok(res, { following: false, requested: false });
};
exports.requests = async (req, res) => {
  const u = await User.findById(req.user._id)
    .select("+followRequests")
    .populate("followRequests", "username fullName profilePicture");
  ok(res, { users: u.followRequests });
};
exports.respond = async (req, res) => {
  const u = await User.findById(req.user._id).select("+followRequests");
  if (!u.followRequests.some((x) => String(x) === req.params.id))
    throw fail(404, "Request not found");
  if (req.body.accept === true) {
    await User.updateOne(
      { _id: u._id },
      { $addToSet: { followers: req.params.id } },
    );
    await User.updateOne(
      { _id: req.params.id },
      { $addToSet: { following: u._id } },
    );
    await notify(req, req.params.id, "accepted");
  }
  await User.updateOne(
    { _id: u._id },
    { $pull: { followRequests: req.params.id } },
  );
  ok(res);
};
exports.connections = async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw fail(404, "User not found");
  assertView(u, req.user);
  const field = req.params.kind;
  if (!["followers", "following"].includes(field))
    throw fail(400, "Invalid list");
  const { page: p, limit } = page(req);
  const users = await User.find({ _id: { $in: u[field] } })
    .select("username fullName profilePicture")
    .skip((p - 1) * limit)
    .limit(limit);
  ok(res, { users, hasMore: p * limit < u[field].length });
};
exports.suggested = async (req, res) => {
  const users = await User.find({
    _id: { $nin: [req.user._id, ...req.user.following] },
  })
    .select("username fullName profilePicture isPrivate")
    .limit(8);
  ok(res, { users });
};
