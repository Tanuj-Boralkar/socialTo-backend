const { Schema, model } = require("mongoose")
const schema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, maxlength: 4000, default: "" },
    image: { url: String, publicId: String },
    seenBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },

)
schema.index({ conversation: 1, createdAt: -1 })

module.exports = model("Message", schema)
