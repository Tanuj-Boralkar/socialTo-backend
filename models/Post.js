const { Schema, model } = require("mongoose");
const schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    caption: { type: String, maxlength: 2200, default: "" },
    media: [
      {
        url: String,
        publicId: String,
        type: { type: String, enum: ["image", "video"] },
      },
    ],
    mediaType: {
      type: String,
      enum: ["image", "video", "carousel"],
      required: true,
    },
    location: { type: String, maxlength: 100, default: "" },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    comments: [{ type: Schema.Types.ObjectId, ref: "Comment" }],
    taggedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);
schema.index({ createdAt: -1 });
module.exports = model("Post", schema);
