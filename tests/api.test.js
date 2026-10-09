const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const request = require("supertest");
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.NODE_ENV = "test";
const app = require("../app");
const User = require("../models/User");
const Post = require("../models/Post");
const Reel = require("../models/Reel");
const Story = require("../models/Story");
const Conversation = require("../models/Conversation");
const Notification = require("../models/Notification");
let mongo, alice, bob, eve;
const auth = (req, user) => req.set("Authorization", `Bearer ${user.token}`);
async function signup(username) {
  const r = await request(app)
    .post("/api/v1/auth/register")
    .send({
      username,
      fullName: username,
      email: `${username}@example.test`,
      password: "StrongPassword123!",
    });
  assert.equal(r.status, 200);
  return r.body.data;
}
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  alice = await signup("alice");
  bob = await signup("bob");
  eve = await signup("eve");
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("authentication rejects unauthenticated calls and omits password/email", async () => {
  assert.equal((await request(app).get("/api/v1/posts")).status, 401);
  assert.equal(alice.user.password, undefined);
  assert.equal(alice.user.email, undefined);
  assert.equal(alice.user.tokenVersion, undefined);
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "alice@example.test", password: "wrong" })
    ).status,
    401,
  );
});
test("invalid signup and disallowed origin are rejected", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/register")
        .send({ username: "?", password: "x" })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/refresh")
        .set("Origin", "https://evil.example")
    ).status,
    403,
  );
});
test("refresh cookie restores session and is HttpOnly", async () => {
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "alice@example.test", password: "StrongPassword123!" });
  const cookie = login.headers["set-cookie"];
  assert.match(cookie[0], /HttpOnly/);
  const r = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", cookie);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.token);
});
test("private profiles hide posts, stories, reels and deny messaging until accepted", async () => {
  await auth(request(app).put("/api/v1/users/profile"), bob).send({
    isPrivate: true,
  });
  const post = await Post.create({
    user: bob.user._id,
    media: [{ url: "https://example.test/p.jpg", type: "image" }],
    mediaType: "image",
  });
  const reel = await Reel.create({
    user: bob.user._id,
    media: { url: "https://example.test/r.mp4", type: "video" },
  });
  const story = await Story.create({
    user: bob.user._id,
    media: { url: "https://example.test/s.jpg", type: "image" },
    expiresAt: new Date(Date.now() + 100000),
  });
  assert.equal(
    (await auth(request(app).get(`/api/v1/posts/${post._id}`), alice)).status,
    403,
  );
  assert.equal(
    (await auth(request(app).get(`/api/v1/reels/${reel._id}`), alice)).status,
    403,
  );
  assert.equal(
    (await auth(request(app).put(`/api/v1/stories/${story._id}/view`), alice))
      .status,
    403,
  );
  assert.equal(
    (
      await auth(request(app).post("/api/v1/messages"), alice).send({
        userId: bob.user._id,
      })
    ).status,
    403,
  );
  const follow = await auth(
    request(app).put(`/api/v1/users/${bob.user._id}/follow`),
    alice,
  );
  assert.equal(follow.body.data.requested, true);
  assert.equal(
    (await auth(request(app).get("/api/v1/users/requests"), bob)).body.data
      .users[0]._id,
    alice.user._id,
  );
  assert.equal(
    (
      await auth(
        request(app).put(`/api/v1/users/requests/${alice.user._id}`),
        bob,
      ).send({ accept: true })
    ).status,
    200,
  );
  assert.equal(
    (await auth(request(app).get(`/api/v1/posts/${post._id}`), alice)).status,
    200,
  );
  assert.equal(
    (await auth(request(app).get("/api/v1/posts?mode=trending"), eve)).body.data
      .posts.length,
    0,
  );
});
test("post ownership, idempotent likes, save and comments", async () => {
  const p = await Post.create({
    user: alice.user._id,
    caption: "hello",
    media: [{ url: "https://example.test/a.jpg", type: "image" }],
    mediaType: "image",
  });
  assert.equal(
    (
      await auth(request(app).put(`/api/v1/posts/${p._id}`), eve).send({
        caption: "hacked",
      })
    ).status,
    403,
  );
  assert.equal(
    (await auth(request(app).delete(`/api/v1/posts/${p._id}`), eve)).status,
    403,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await auth(request(app).put(`/api/v1/posts/${p._id}/like`), bob)).status,
      200,
    );
  assert.equal((await Post.findById(p._id)).likes.length, 1);
  assert.equal(
    await Notification.countDocuments({ post: p._id, type: "like" }),
    1,
  );
  await auth(request(app).put(`/api/v1/posts/${p._id}/save`), bob);
  assert.equal(
    (await auth(request(app).get("/api/v1/posts?mode=saved"), bob)).body.data
      .posts[0]._id,
    String(p._id),
  );
  const c = await auth(
    request(app).post(`/api/v1/comments/${p._id}`),
    bob,
  ).send({ text: "Lovely @alice" });
  assert.equal(c.status, 201);
  assert.equal(
    (
      await auth(
        request(app).delete(`/api/v1/comments/${c.body.data.comment._id}`),
        eve,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await auth(
        request(app).delete(`/api/v1/comments/${c.body.data.comment._id}`),
        alice,
      )
    ).status,
    200,
  );
});
test("conversation membership protects history, sending and seen updates", async () => {
  const start = await auth(request(app).post("/api/v1/messages"), alice).send({
    userId: bob.user._id,
  });
  assert.equal(start.status, 200);
  const id = start.body.data.conversation._id;
  const repeat = await auth(request(app).post("/api/v1/messages"), bob).send({
    userId: alice.user._id,
  });
  assert.equal(repeat.body.data.conversation._id, id);
  assert.equal(await Conversation.countDocuments(), 1);
  assert.equal(
    (
      await auth(request(app).post(`/api/v1/messages/${id}`), alice).send({
        text: "Hello Bob",
      })
    ).status,
    201,
  );
  assert.equal(
    (await auth(request(app).get(`/api/v1/messages/${id}`), eve)).status,
    404,
  );
  assert.equal(
    (
      await auth(request(app).post(`/api/v1/messages/${id}`), eve).send({
        text: "intrusion",
      })
    ).status,
    404,
  );
  assert.equal(
    (await auth(request(app).put(`/api/v1/messages/${id}/seen`), eve)).status,
    404,
  );
  await auth(request(app).put(`/api/v1/messages/${id}/seen`), bob);
  const history = await auth(request(app).get(`/api/v1/messages/${id}`), alice);
  assert.equal(history.body.data.messages[0].seenBy.length, 2);
});
test("search escapes regex and expires stories at query time", async () => {
  assert.equal(
    (await auth(request(app).get("/api/v1/search?q=.*"), alice)).body.data.users
      .length,
    0,
  );
  await Story.create({
    user: alice.user._id,
    expiresAt: new Date(Date.now() - 1000),
    media: { url: "https://example.test/expired.jpg", type: "image" },
  });
  const r = await auth(request(app).get("/api/v1/stories"), alice);
  assert.ok(
    r.body.data.stories.every((s) => new Date(s.expiresAt) > new Date()),
  );
});
test("invalid identifiers and upload MIME get consistent errors", async () => {
  assert.equal(
    (await auth(request(app).get("/api/v1/posts/not-an-id"), alice)).status,
    400,
  );
  const r = await auth(request(app).post("/api/v1/posts"), alice).attach(
    "media",
    Buffer.from("script"),
    { filename: "bad.html", contentType: "text/html" },
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.success, false);
  const fake = await auth(request(app).post("/api/v1/posts"), alice).attach(
    "media",
    Buffer.from("not a jpeg"),
    { filename: "bad.jpg", contentType: "image/jpeg" },
  );
  assert.equal(fake.status, 400);
});
test("logout revokes access and refresh tokens", async () => {
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "eve@example.test", password: "StrongPassword123!" });
  const data = login.body.data;
  assert.equal(
    (await auth(request(app).post("/api/v1/auth/logout"), data)).status,
    200,
  );
  assert.equal(
    (await auth(request(app).get("/api/v1/auth/me"), data)).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", login.headers["set-cookie"])
    ).status,
    401,
  );
});