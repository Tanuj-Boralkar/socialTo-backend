const User = require("../models/User");
const { verify } = require("../utils/generateToken");
const asyncHandler = require("../utils/asyncHandler");
const { fail } = require("../utils/http");
exports.authenticate = async (token) => {
  let data;
  try {
    data = verify(token);
  } catch {
    throw fail(401, "Session expired. Please log in.");
  }
  if (data.type !== "access") throw fail(401, "Invalid access token");
  const user = await User.findById(data.sub).select("+tokenVersion");
  if (!user || user.tokenVersion !== data.ver)
    throw fail(401, "Session expired. Please log in.");
  return user;
};
exports.protect = asyncHandler(async (req, res, next) => {
  req.user = await exports.authenticate(
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "",
  );
  next();
});
exports.trustedOrigin = (req, res, next) => {
  const allowed = (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((x) => x.trim());
  if (req.headers.origin && !allowed.includes(req.headers.origin))
    return next(fail(403, "Origin not allowed"));
  next();
};
