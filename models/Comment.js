const { Schema, model } = require("mongoose")
const { string } = require("zod")
module.exports = model(
  "Comment",
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: "User", Required: true },
      post: { type: Schema.Types.ObjectId, ref: "Post", index: true },
      reel: { type: Schema.Types.ObjectId, ref: "Reel", index: true },
      text: {
        type: String,
        required: [true, "Comment text is required"],
        trim: true,
        maxlength: [1000, "Comment cannot exceed 1000 characters"],
      },
    },
    { timestamps: true },
  )
)