const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
process.env.JWT_SECRET = "unit-only-secret-at-least-32-characters-long";
process.env.CLIENT_URL = "http://localhost:5173";
const User = require("../models/User");
const Post = require("../models/Post");
const Story = require("../models/Story");
const { sign, verify } = require("../utils/generateToken");
const { canView, publicUser } = require("../utils/access");
const { uploadFile } = require("../utils/cloudinaryUpload");
const app = require("../app");
const owner = new User({
  username: "owner",
  email: "owner@example.test",
  password: "hashed",
  fullName: "Owner",
  isPrivate: true,
});
const viewer = new User({
  username: "viewer",
  email: "viewer@example.test",
  password: "hashed",
  fullName: "Viewer",
});
test("access/refresh JWTs have distinct type, issuer and audience", () => {
  const access = verify(sign(owner));
  const refresh = verify(sign(owner, "refresh"));
  assert.equal(access.type, "access");
  assert.equal(refresh.type, "refresh");
  assert.equal(access.iss, "socialgram");
  assert.equal(access.aud, "socialgram-web");
  assert.ok(refresh.exp > access.exp);
  assert.throws(() => verify("invalid"));
});
test("private profile access allows only owner or followers", () => {
  assert.equal(canView(owner, owner), true);
  assert.equal(canView(owner, viewer), false);
  owner.followers.push(viewer._id);
  assert.equal(canView(owner, viewer), true);
  owner.followers = [];
});
test("public serializer removes credentials and other users saved lists", () => {
  owner.savedPosts = [new mongoose.Types.ObjectId()];
  const visible = publicUser(owner, viewer);
  for (const key of [
    "password",
    "email",
    "tokenVersion",
    "avatarPublicId",
    "followRequests",
    "savedPosts",
    "savedReels",
  ])
    assert.equal(visible[key], undefined);
  assert.equal(publicUser(owner, owner).savedPosts.length, 1);
});
test("Mongoose validates username and caption constraints", async () => {
  await assert.rejects(
    new User({
      username: "bad!",
      email: "x",
      password: "h",
      fullName: "A",
    }).validate(),
  );
  await assert.rejects(
    new Post({
      user: owner._id,
      caption: "x".repeat(2201),
      mediaType: "image",
    }).validate(),
  );
  await assert.rejects(new Story({ user: owner._id }).validate());
});
test("invalid and spoofed media rejected before cloud upload", async () => {
  await assert.rejects(uploadFile(), (e) => e.status === 400);
  await assert.rejects(
    uploadFile({ buffer: Buffer.from("not media"), mimetype: "image/jpeg" }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    uploadFile({
      buffer: Buffer.from("<svg></svg>"),
      mimetype: "image/svg+xml",
    }),
    (e) => e.status === 400,
  );
});
test("health and missing routes follow response contract", async () => {
  const health = await request(app).get("/api/v1/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.success, true);
  assert.equal((await request(app).get("/api/v1/missing")).status, 404);
});
test("protected APIs reject missing, malformed and refresh bearer JWTs", async () => {
  for (const header of [
    "",
    "Bearer invalid",
    `Bearer ${sign(owner, "refresh")}`,
  ]) {
    const r = await request(app)
      .get("/api/v1/posts")
      .set("Authorization", header);
    assert.equal(r.status, 401);
    assert.equal(r.body.success, false);
  }
});
test("origin and input validation run before database writes", async () => {
  const blocked = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Origin", "https://untrusted.example");
  assert.equal(blocked.status, 403);
  const invalid = await request(app)
    .post("/api/v1/auth/register")
    .send({ username: "x", email: "invalid", password: "short" });
  assert.equal(invalid.status, 400);
});
after(() => mongoose.disconnect());