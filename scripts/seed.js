require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Post = require("../models/Post");
const Reel = require("../models/Reel");
const Story = require("../models/Story");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const cloudinary = require("../config/cloudinary");
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Demo seeding is disabled in production. Use a development database.",
    );
  if (!process.env.MONGO_URI)
    throw new Error("Configure MONGO_URI in backend/.env first.");
  await mongoose.connect(process.env.MONGO_URI);
  const password = process.env.SEED_PASSWORD || "SocialGramDemo!2026";
  const hash = await bcrypt.hash(password, 12);
  const data = [
    ["tanuj", "Tanuj Boralkar", "Building things, collecting moments. Pune ↗"],
    [
      "maya",
      "Maya Kapoor",
      "Slow mornings, long walks & everything in between.",
    ],
    ["arjun", "Arjun Mehta", "A little adventure, every day."],
    ["nora", "Nora Williams", "Seeing the ordinary a little differently."],
  ];
  const users = [];
  for (const [username, fullName, bio] of data) {
    let u = await User.findOne({ email: `${username}@socialgram.test` });
    if (!u)
      u = await User.create({
        username,
        fullName,
        bio,
        email: `${username}@socialgram.test`,
        password: hash,
      });
    users.push(u);
  }
  for (const u of users) {
    const others = users.filter((x) => !x._id.equals(u._id)).map((x) => x._id);
    await User.updateOne(
      { _id: u._id },
      {
        $addToSet: {
          followers: { $each: others },
          following: { $each: others },
        },
      },
    );
  }
  const captions = [
    "The kind of morning you wish you could bottle. ☀️ #slowdays",
    "A quieter kind of weekend. @tanuj this is your sign to take that trip.",
    "Found a little color in the everyday.",
    "Somewhere between the mountains and a good conversation.",
    "The best plans are the ones you don’t make.",
    "One more sunset, one more reason to stay.",
  ];
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    for (let i = 0; i < captions.length; i++) {
      if (
        await Post.exists({
          caption: captions[i],
          user: users[(i + 1) % users.length]._id,
        })
      )
        continue;
      const r = await cloudinary.uploader.upload(
        path.join(__dirname, `../seed-assets/moment-${i + 1}.png`),
        { folder: "socialgram/demo", resource_type: "image" },
      );
      await Post.create({
        user: users[(i + 1) % users.length]._id,
        caption: captions[i],
        location: ["Pune, India", "Somewhere peaceful", "The little things"][
          i % 3
        ],
        media: [{ url: r.secure_url, publicId: r.public_id, type: "image" }],
        mediaType: "image",
        likes: [users[0]._id],
        taggedUsers: i === 1 ? [users[0]._id] : [],
      });
    }
    const sample = await Post.findOne({ user: users[1]._id });
    if (
      sample &&
      !(await Story.exists({
        user: users[1]._id,
        expiresAt: { $gt: new Date() },
      }))
    ) {
      const r = await cloudinary.uploader.upload(
        path.join(__dirname, "../seed-assets/moment-2.png"),
        { folder: "socialgram/demo", resource_type: "image" },
      );
      await Story.create({
        user: users[1]._id,
        media: { url: r.secure_url, publicId: r.public_id, type: "image" },
        expiresAt: new Date(Date.now() + 86400000),
      });
    }
    if (
      process.env.SEED_REEL_PATH &&
      !(await Reel.exists({ user: users[1]._id }))
    ) {
      const r = await cloudinary.uploader.upload(
        path.resolve(process.env.SEED_REEL_PATH),
        { folder: "socialgram/demo", resource_type: "video" },
      );
      await Reel.create({
        user: users[1]._id,
        caption: "A little moment in motion.",
        audio: "Original audio",
        media: { url: r.secure_url, publicId: r.public_id, type: "video" },
      });
    }
  } else
    console.log(
      "Cloudinary is not configured: created users and conversation only. Run seed again after configuring media credentials.",
    );
  const pairKey = [String(users[0]._id), String(users[1]._id)].sort().join(":");
  let c = await Conversation.findOne({ pairKey });
  if (!c) {
    c = await Conversation.create({
      pairKey,
      participants: [users[0]._id, users[1]._id],
    });
    const m = await Message.create({
      conversation: c._id,
      sender: users[1]._id,
      text: "Hey! Welcome to our little corner of the internet 🌿",
      seenBy: [users[1]._id],
    });
    c.lastMessage = m._id;
    await c.save();
  }
  console.log(
    "Demo accounts (new accounts use SEED_PASSWORD or SocialGramDemo!2026):",
  );
  for (const u of data) console.log(`${u[0]}@socialgram.test`);
  console.log(
    "Existing account passwords are never overwritten. Demo artwork is original geometric illustration.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());