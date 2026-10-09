const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");
const { trustedOrigin } = require("./middleware/authMiddleware");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
const origins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((x) => x.trim());
app.use(cors({ origin: origins, credentials: true }));
app.use(trustedOrigin);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please slow down.",
    },
  }),
);
app.get("/api/v1/health", (req, res) =>
  res.json({ success: true, message: "SocialGram API is running", data: {} }),
);
for (const [path, name] of Object.entries({
  auth: "auth",
  users: "user",
  posts: "post",
  comments: "comment",
  stories: "story",
  reels: "reel",
  notifications: "notification",
  messages: "message",
  search: "search",
}))
  app.use(`/api/v1/${path}`, require(`./routes/${name}Routes`));
app.use(notFound);
app.use(errorHandler);
module.exports = app;