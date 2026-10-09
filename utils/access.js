const User = require("../models/User");
const { fail } = require("./http");
exports.canView = (owner, viewer) =>
  !owner.isPrivate ||
  String(owner._id) === String(viewer._id) ||
  owner.followers.some((id) => String(id) === String(viewer._id));
exports.visibleUserIds = async (viewer) =>
  (
    await User.find({
      $or: [
        { isPrivate: false },
        { _id: viewer._id },
        { followers: viewer._id },
      ],
    }).select("_id")
  ).map((u) => u._id);
exports.assertView = (owner, viewer) => {
  if (!owner || !exports.canView(owner, viewer))
    throw fail(403, "This account is private. Follow it to see content.");
};
exports.publicUser = (u, viewer) => {
  const o = u.toObject ? u.toObject() : { ...u };
  for (const k of [
    "password",
    "email",
    "tokenVersion",
    "avatarPublicId",
    "followRequests",
    "savedPosts",
    "savedReels",
  ])
    delete o[k];
  if (viewer && String(viewer._id) === String(u._id)) {
    o.savedPosts = u.savedPosts;
    o.savedReels = u.savedReels;
  }
  return o;
};
exports.authorFields = "username fullName profilePicture isPrivate followers";
