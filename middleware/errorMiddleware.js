exports.notFound = (req, res) =>
  res.status(404).json({ success: false, message: "API endpoint not found" });
exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500,
    message = err.message || "Something went wrong";
  if (err.name === "ValidationError" || err.name === "ZodError") {
    status = 400;
    message =
      err.issues?.map((x) => x.message).join(", ") ||
      Object.values(err.errors)
        .map((x) => x.message)
        .join(", ");
  }
  if (err.name === "CastError") {
    status = 400;
    message = "Invalid identifier";
  }
  if (err.code === 11000) {
    status = 409;
    message = "Username or email already exists";
  }
  if (err.name === "MulterError") {
    status = 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Each file must be smaller than 20 MB"
        : "Invalid upload or too many files";
  }
  if (status >= 500) {
    console.error(err);
    message = "Server error. Please try again.";
  }
  res.status(status).json({ success: false, message });
};
