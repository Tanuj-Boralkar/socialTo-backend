const { Schema, model } = require("mongoose");
const schema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "follow",
        "request",
        "like",
        "comment",
        "mention",
        "message",
        "accepted",
      ],
      required: true,
    },
    post: { type: Schema.Types.ObjectId, ref: "Post" },
    reel: { type: Schema.Types.ObjectId, ref: "Reel" },
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ recipient: 1, createdAt: -1 });
module.exports = model("Notification", schema);
