const { Server } = require("socket.io");
const { authenticate } = require("../middleware/authMiddleware");
const { member } = require("../controllers/messageController");
const { verify } = require("../utils/generateToken");
module.exports = (server, app) => {
  const io = new Server(server, {
    cors: {
      origin: (process.env.CLIENT_URL || "http://localhost:5173")
        .split(",")
        .map((x) => x.trim()),
      credentials: true,
    },
    maxHttpBufferSize: 10000,
  });
  app.set("io", io);
  const online = new Map();
  io.use(async (socket, next) => {
    try {
      socket.user = await authenticate(socket.handshake.auth.token);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    const id = String(socket.user._id);
    socket.join(`user:${id}`);
    online.set(id, (online.get(id) || 0) + 1);
    io.emit("presence", [...online.keys()]);
    const expiry = verify(socket.handshake.auth.token).exp * 1000 - Date.now();
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, expiry),
    );
    let lastTyping = 0;
    socket.on("typing", async (payload) => {
      try {
        if (Date.now() - lastTyping < 400) return;
        lastTyping = Date.now();
        await authenticate(socket.handshake.auth.token);
        if (typeof payload?.conversation !== "string") return;
        const c = await member(payload.conversation, socket.user._id);
        for (const p of c.participants)
          if (String(p) !== id)
            io.to(`user:${p}`).emit("typing", {
              conversation: String(c._id),
              userId: id,
              typing: !!payload.typing,
            });
      } catch {
        socket.emit("error-message", "Conversation unavailable");
      }
    });
    socket.on("disconnect", () => {
      clearTimeout(timer);
      const n = (online.get(id) || 1) - 1;
      if (n) online.set(id, n);
      else online.delete(id);
      io.emit("presence", [...online.keys()]);
    });
  });
  return io;
};