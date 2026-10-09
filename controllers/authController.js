const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const { sign, verify, cookieOptions } = require("../utils/generateToken");
const { ok, fail } = require("../utils/http");
const { publicUser } = require("../utils/access");
const password = z
  .string()
  .min(8, "Password must have at least 8 characters")
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Use 3–24 letters, numbers or underscores"),
  fullName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().toLowerCase(),
  password,
});
const session = (res, u) => {
  const refresh = sign(u, "refresh");
  const exp = verify(refresh).exp;
  res.cookie("sg_refresh", refresh, {
    ...cookieOptions(),
    expires: new Date(exp * 1000),
  });
  return ok(res, { user: publicUser(u, u), token: sign(u) });
};
exports.register = async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (
    [
      "login",
      "register",
      "explore",
      "reels",
      "search",
      "messages",
      "notifications",
      "settings",
      "p",
      "api",
    ].includes(data.username)
  )
    throw fail(400, "This username is reserved");
  data.password = await bcrypt.hash(data.password, 12);
  return session(res, await User.create(data));
};
exports.login = async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().email().toLowerCase(),
      password: z.string().min(1).max(72),
    })
    .parse(req.body);
  const u = await User.findOne({ email: data.email }).select(
    "+password +tokenVersion",
  );
  if (!u || !(await bcrypt.compare(data.password, u.password)))
    throw fail(401, "Incorrect email or password");
  session(res, u);
};
exports.refresh = async (req, res) => {
  let data;
  try {
    data = verify(req.cookies.sg_refresh);
  } catch {
    throw fail(401, "Please log in");
  }
  const u = await User.findById(data.sub).select("+tokenVersion");
  if (data.type !== "refresh" || !u || u.tokenVersion !== data.ver)
    throw fail(401, "Please log in");
  ok(res, { user: publicUser(u, u), token: sign(u) });
};
exports.logout = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  req.app.get("io")?.in(`user:${req.user._id}`).disconnectSockets(true);
  res.clearCookie("sg_refresh", cookieOptions());
  ok(res);
};
exports.me = async (req, res) =>
  ok(res, { user: publicUser(req.user, req.user) });
exports.changePassword = async (req, res) => {
  const data = z
    .object({ currentPassword: z.string(), newPassword: password })
    .parse(req.body);
  const u = await User.findById(req.user._id).select("+password +tokenVersion");
  if (!(await bcrypt.compare(data.currentPassword, u.password)))
    throw fail(400, "Current password is incorrect");
  u.password = await bcrypt.hash(data.newPassword, 12);
  u.tokenVersion++;
  await u.save();
  req.app.get("io")?.in(`user:${u._id}`).disconnectSockets(true);
  session(res, u);
};
