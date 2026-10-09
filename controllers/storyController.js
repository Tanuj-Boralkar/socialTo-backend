const Story = require("../models/Story");
const { ok, fail } = require("../utils/http");
const { visibleUserIds, assertView, authorFields } = require("../utils/access");
const { uploadFile, removeMedia } = require("../utils/cloudinaryUpload");
exports.list = async (req, res) => {
  const visible = await visibleUserIds(req.user);
  const ids = visible.filter(
    (x) =>
      String(x) === String(req.user._id) ||
      req.user.following.some((f) => String(f) === String(x)),
  );
  const stories = await Story.find({
    user: { $in: ids },
    expiresAt: { $gt: new Date() },
  })
    .populate("user", authorFields)
    .sort({ createdAt: 1 })
    .limit(200);
  ok(res, { stories });
};
exports.create = async (req, res) => {
  const media = await uploadFile(req.file);
  let story;
  try {
    story = await Story.create({
      user: req.user._id,
      media,
      expiresAt: new Date(Date.now() + 86400000),
    });
  } catch (e) {
    await removeMedia(media).catch(console.error);
    throw e;
  }
  await story.populate("user", authorFields);
  ok(res, { story }, "Story published", 201);
};
exports.view = async (req, res) => {
  const s = await Story.findOne({
    _id: req.params.id,
    expiresAt: { $gt: new Date() },
  }).populate("user", authorFields);
  if (!s) throw fail(404, "Story expired");
  assertView(s.user, req.user);
  await Story.updateOne(
    { _id: s._id },
    { $addToSet: { viewedBy: req.user._id } },
  );
  ok(res);
};
exports.remove = async (req, res) => {
  const s = await Story.findById(req.params.id);
  if (!s) throw fail(404, "Story not found");
  if (!s.user.equals(req.user._id))
    throw fail(403, "You can only delete your own stories");
  await removeMedia(s.media);
  await s.deleteOne();
  ok(res);
};
exports.cleanup = async () => {
  const expired = await Story.find({ expiresAt: { $lte: new Date() } }).limit(
    100,
  );
  for (const s of expired) {
    try {
      await removeMedia(s.media);
      await s.deleteOne();
    } catch (e) {
      console.error("Story cleanup failed", e.message);
    }
  }
};
