const allowedOrigins = require("../config/allowedOrigins");
const { Server } = require("socket.io");
const { authenticate } = require("../middleware/authMiddleware");
const { member } = require("../controllers/messageController");
const { verify } = require("../utils/generateToken");

module.exports = (server, app) => {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
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

    const expiry =
      verify(socket.handshake.auth.token).exp * 1000 - Date.now();

    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, expiry)
    );

    let lastTyping = 0;

    socket.on("typing", async (payload) => {
      try {
        if (Date.now() - lastTyping < 400) return;

        lastTyping = Date.now();

        await authenticate(socket.handshake.auth.token);

        if (typeof payload?.conversation !== "string") return;

        const conversation = await member(
          payload.conversation,
          socket.user._id
        );

        for (const participant of conversation.participants) {
          if (String(participant) !== id) {
            io.to(`user:${participant}`).emit("typing", {
              conversation: String(conversation._id),
              userId: id,
              typing: !!payload.typing,
            });
          }
        }
      } catch {
        socket.emit("error-message", "Conversation unavailable");
      }
    });

    socket.on("disconnect", () => {
      clearTimeout(timer);

      const remaining = (online.get(id) || 1) - 1;

      if (remaining) {
        online.set(id, remaining);
      } else {
        online.delete(id);
      }

      io.emit("presence", [...online.keys()]);
    });
  });

  return io;
};