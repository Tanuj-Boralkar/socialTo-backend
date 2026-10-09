const mongoose = require("mongoose")
const { Schema } = mongoose
const ref = { type: Schema.Types.ObjectId, ref: "User" }
const schema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]{3,24}$/,
    },
    fullName: { type: String, required: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      select: false,
    },
    password: { type: String, required: true, select: false },
    bio: { type: String, default: "", maxlength: 160 },
    profilePicture: { type: String, default: "" },
    avatarPublicId: { type: String, select: false },
    website: { type: String, default: "" },
    gender: { type: String, default: "" },
    followers: [ref],
    following: [ref],
    followRequests: { type: [ref], select: false },
    savedPosts: [{ type: Schema.Types.ObjectId, ref: "Post" }],
    savedReels: [{ type: Schema.Types.ObjectId, ref: "Reel" }],
    isPrivate: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);
module.exports = mongoose.model("User", schema);
