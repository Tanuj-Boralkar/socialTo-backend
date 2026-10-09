const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");

const allowedOrigins = require("./config/allowedOrigins");
const { trustedOrigin } = require("./middleware/authMiddleware");
const {
  notFound,
  errorHandler,
} = require("./middleware/errorMiddleware");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

const corsOptions = {
  origin(origin, callback) {
    // Requests without Origin include Postman and server-to-server calls.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error("Origin not allowed");
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// Handles preflight OPTIONS requests as well as normal requests.
app.use(cors(corsOptions));

app.use(trustedOrigin);

app.use(express.json({ limit: "100kb" }));
app.use(
  express.urlencoded({
    extended: false,
    limit: "100kb",
  })
);
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
  })
);

app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    message: "SocialGram API is running",
    data: {},
  });
});

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
})) {
  app.use(
    `/api/v1/${path}`,
    require(`./routes/${name}Routes`)
  );
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;