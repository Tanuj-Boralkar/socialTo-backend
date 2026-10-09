require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const http = require("http");
const connectDB = require("./config/db");
async function start() {
  if (!process.env.MONGO_URI)
    throw new Error(
      "Set MONGO_URI in backend/.env to your MongoDB Atlas connection string. See README.md.",
    );
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error(
      "Set JWT_SECRET to at least 32 random characters. Generate it with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  for (const key of [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ])
    if (!process.env[key])
      console.warn(
        `${key} is missing: media uploads will be unavailable until configured.`,
      );
  await connectDB();
  const app = require("./app");
  const server = http.createServer(app);
  const io = require("./socket/socket")(server, app);
  server.listen(process.env.PORT || 5000, () =>
    console.log(`SocialGram API listening on ${process.env.PORT || 5000}`),
  );
  const cleanup = require("./controllers/storyController").cleanup;
  cleanup().catch(console.error);
  const interval = setInterval(() => cleanup().catch(console.error), 60000);
  interval.unref();
  const stop = () => {
    clearInterval(interval);
    io.close();
    server.close(async () => {
      await require("mongoose").disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
start().catch((error) => {
  console.error("Startup failed:", error.stack);
  process.exit(1);
});