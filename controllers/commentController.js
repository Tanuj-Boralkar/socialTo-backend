const { z } = require("zod");
const Comment = require("../models/Comment");
const Post = require("../models/Post");
const Reel = require("../models/Reel");
const { ok, fail, page } = require("../utils/http");
const { notify, mentions } = require("../utils/notifications");
async function target(req) {
  const kind =
    req.query.kind === "reel" || req.body.kind === "reel" ? "reel" : "post";
  const id = req.params.targetId;
  const entity = await require(`./${kind}Controller`).load(id, req.user);
  return { kind, entity, Model: kind === "reel" ? Reel : Post };
}
exports.list = async (req, res) => {
  const { kind, entity } = await target(req);
  const { page: p, limit } = page(req);
  const comments = await Comment.find({ [kind]: entity._id })
    .populate("user", "username profilePicture fullName")
    .sort({ createdAt: -1 })
    .skip((p - 1) * limit)
    .limit(limit + 1);
  ok(res, {
    comments: comments.slice(0, limit),
    hasMore: comments.length > limit,
  });
};
exports.create = async (req, res) => {
  const { kind, entity, Model } = await target(req);
  const { text } = z
    .object({ text: z.string().trim().min(1).max(1000) })
    .parse(req.body);
  const c = await Comment.create({
    [kind]: entity._id,
    user: req.user._id,
    text,
  });
  await Model.updateOne(
    { _id: entity._id },
    { $addToSet: { comments: c._id } },
  );
  await notify(req, entity.user._id, "comment", { [kind]: entity._id });
  await mentions(req, text, { [kind]: entity._id });
  await c.populate("user", "username profilePicture fullName");
  ok(res, { comment: c }, "Comment added", 201);
};
exports.remove = async (req, res) => {
  const c = await Comment.findById(req.params.id);
  if (!c) throw fail(404, "Comment not found");
  const Model = c.reel ? Reel : Post;
  const parent = await Model.findById(c.reel || c.post);
  if (!c.user.equals(req.user._id) && !parent?.user.equals(req.user._id))
    throw fail(403, "You cannot delete this comment");
  await Model.updateOne({ _id: parent?._id }, { $pull: { comments: c._id } });
  await c.deleteOne();
  ok(res);
};
