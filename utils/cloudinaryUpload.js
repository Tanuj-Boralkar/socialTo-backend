const cloudinary = require("../config/cloudinary");
const { fail } = require("./http");
exports.uploadFile = async (file) => {
  if (!file) throw fail(400, "Choose a media file");
  const { fileTypeFromBuffer } = await import("file-type");
  let detected;
  try {
    detected = await fileTypeFromBuffer(file.buffer);
  } catch {
    throw fail(400, "Invalid or truncated media file");
  }
  if (
    !detected ||
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ].includes(detected.mime)
  )
    throw fail(400, "File contents are not a supported image/video");
  if (detected.mime.split("/")[0] !== file.mimetype.split("/")[0])
    throw fail(400, "File contents do not match file type");
  const result = await new Promise((resolve, reject) =>
    cloudinary.uploader
      .upload_stream({ folder: "socialgram", resource_type: "auto" }, (e, r) =>
        e ? reject(e) : resolve(r),
      )
      .end(file.buffer),
  );
  return {
    url: result.secure_url,
    publicId: result.public_id,
    type: result.resource_type,
  };
};
exports.removeMedia = async (media) => {
  for (const item of [].concat(media || []))
    if (item?.publicId)
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.type || "image",
        invalidate: true,
      });
};
exports.uploadMany = async (files) => {
  const result = [];
  try {
    for (const file of files || []) result.push(await exports.uploadFile(file));
    return result;
  } catch (e) {
    await exports.removeMedia(result).catch(console.error);
    throw e;
  }
};
