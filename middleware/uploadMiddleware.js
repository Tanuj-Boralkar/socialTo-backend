const multer = require("multer")
const { fail } = require("../utils/http")
const allowed = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10,
    fields: 15,
    fieldSize: 12000,
  },

  fileFilter: (req, file, cb) =>
    cb(
      allowed.includes(file.mimetype)
        ? null
        : fail(
          400,
          "Only JPEG,PNG,WebP,GIF,MP4, WebM and MOV are supported",
        ),
      allowed.includes(file.mimetype),
    ),
})

module.exports = upload