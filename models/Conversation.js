const { Schema, model } = require("mongoose")

const schema = new Schema(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],

    pairKey: { type: String, unique: true, required: true },
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true },
)

schema.index({ participants: 1, updatedAt: -1 })
module.exports = model("Conversation", schema)
