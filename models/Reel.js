const { Schema, model } = require("mongoose");

const schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    caption: {
      type: String,
      default: "",
      maxlength: 2200,
    },
    media: {
      url: String,
      publicId: String,
      type: {
        type: String,
        default: "video",
      },
    },
    audio: {
      type: String,
      default: "Original audio",
      maxlength: 100,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],
  },
  {
    timestamps: true,
  }
);

schema.index({ createdAt: -1 });

module.exports = model("Reel", schema);