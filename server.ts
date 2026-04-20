import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Socket.io signaling logic
  // We'll use the Firebase UID as the lookup key for signaling
  const users = new Map<string, string>(); // uid -> socketId

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("register", (uid: string) => {
      users.set(uid, socket.id);
      socket.join(uid); // Join a room for the user to receive targeted messages
      console.log(`User ${uid} registered with socket ${socket.id}`);
    });

    socket.on("call-user", ({ to, offer, from, fromProfile, isVideo }) => {
      const targetSocketId = users.get(to);
      if (targetSocketId) {
        io.to(to).emit("call-made", {
          offer,
          from,
          fromProfile,
          isVideo
        });
      }
    });

    socket.on("make-answer", ({ to, answer }) => {
      io.to(to).emit("answer-made", {
        answer
      });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", {
        candidate
      });
    });

    socket.on("end-call", ({ to }) => {
      io.to(to).emit("call-ended");
    });

    socket.on("disconnect", () => {
      // Find and remove the user from the map
      for (const [uid, socketId] of users.entries()) {
        if (socketId === socket.id) {
          users.delete(uid);
          break;
        }
      }
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
