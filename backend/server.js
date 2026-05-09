import app from "./src/app.js";
import { testConnection , pool } from "./src/db/index.js";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

const PORT = process.env.PORT || 3000;


// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Development ke liye, production mein frontend URL dalen
        methods: ["GET", "POST" , "PATCH" , "DELETE" , "PUT"]
    }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (user_id) => {
    socket.join(`userId:${user_id}`);
   console.log(`✅ User joined room: userId:${user_id}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});


testConnection()
.then((conn)=>{
  server.listen(process.env.PORT , ()=>{
    console.log(`app is up and running on port ${process.env.PORT}`);
    
console.log("Starting Svayam Expense Tracker Backend...", process.env.PORT , process.env.JWT_SECRET);
})
})
.catch((err)=>console.log(err));


export {io};