import { Elysia } from "elysia";

const app = new Elysia()

interface Player {
  name: string;
  color: string;
  ws: any;
  clickable: boolean;
  score: number;
  clickedTimestamp: number;
}

interface Room {
  id: string;
  players: Player[];
}

const rooms: Record<string, Room> = {};

function createRoom(roomId: string): Room {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      players: []
    };
    console.log(`Room created: ${roomId}`);
  }
  return rooms[roomId];
}

function getRandomColor(): string {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

function addPlayerToRoom(roomId: string, player: Player) {
  const room = createRoom(roomId);
  room.players.push(player);
  broadcastPlayers(room);
  console.log(`Player ${player.name} joined room ${roomId}`);
}

function removePlayerFromRoom(roomId: string, ws: any) {
  const room = rooms[roomId];
  if (!room) return;

  const playerIndex = room.players.findIndex(player => {
   return player.ws.readyState === ws.readyState && 
           player.ws.url === ws.url;
  });
  
  if (playerIndex !== -1) {
    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    console.log(`Player ${player.name} left room ${roomId}`);

    if (room.players.length === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      broadcastPlayers(room);
    }
  }
}

function broadcastPlayers(room: Room) {
  const playersList = room.players.map(player => ({
    name: player.name,
    color: player.color,
    score: player.score
  }));

  const message = JSON.stringify({
    type: "players",
    players: playersList
  });

  room.players.forEach(player => {
    player.ws.send(message);
  });
}

function broadcastClick(room: Room) {
  const message = JSON.stringify({
    type: "click",
    players: room.players
  });

  room.players.forEach(player => {
    player.ws.send(message);
  });
}

function broadcastClickable(room: Room, clickableTime: number) {
  const message = JSON.stringify({
    type: "clickable",
    clickableTime: clickableTime,
    timestamp: Date.now()
  });

  room.players.forEach(player => {
    player.ws.send(message);
  });
}

app.get("/", () => {
  return Bun.file("public/index.html")
})

app.get("/room/:room", () => {
  return Bun.file("public/room.html")
})

app.ws("/room/:room", {
  open(ws) {
    console.log("Client connected")
    const roomId = ws.data.params.room;
    createRoom(roomId);
  },
  close(ws) {
    console.log("Client disconnected")
    const roomId = ws.data.params.room;
    removePlayerFromRoom(roomId, ws);
  },
  message(ws, message) {
    try {
      const data = typeof message === "string" ? JSON.parse(message) : message;
      const roomId = ws.data.params.room;
      const room = rooms[roomId];

      if (!room) return;

      switch (data.type) {
        case "join":
          const playerName = data.name;
          const existingPlayer = room.players.find(p => p.ws === ws);

          if (room.players.length >= 8) {
            ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
            return;
          }
          if (room.players.some(p => p.name === playerName)) {
            ws.send(JSON.stringify({ type: "error", message: "Player name already taken" }));
            return;
          }

          if (playerName.length > 8) {
            ws.send(JSON.stringify({ type: "error", message: "Player name is too long" }));
            return;
          }

          if (existingPlayer) {
            existingPlayer.name = playerName;
          } else {
            const newPlayer: Player = {
              name: playerName,
              ws: ws,
              color: getRandomColor(),
              clickable: false,
              score: 0,
              clickedTimestamp: 0
            };
            addPlayerToRoom(roomId, newPlayer);
          }
          break;

        case "increase-score":
          const playerToIncrease = room.players.find(p => p.name === data.name);
          if (playerToIncrease) {
            playerToIncrease.score += 1;
            console.log(`Player ${playerToIncrease.name} score increased to ${playerToIncrease.score}`);
            broadcastPlayers(room);
          }
          break;

        case "decrease-score":
          const playerToDecrease = room.players.find(p => p.name === data.name);
          if (playerToDecrease) {
            playerToDecrease.score -= 1;
            broadcastPlayers(room);
          }
          break;

        case "reset-score":
          const playerToReset = room.players.find(p => p.name === data.name);
          if (playerToReset) {
            playerToReset.score = 0;
            console.log(`Player ${playerToReset.name} score reset to ${playerToReset.score}`);
            broadcastPlayers(room);
          }
          break;

        case "clickable":
          console.log("Clickable message received");
          const clickableTime = data.clickableTime ? data.clickableTime : 3000;
          console.log(`Clickable time started: ${clickableTime} milliseconds`);
          room.players.forEach(player => {
            player.clickable = false;
            player.clickedTimestamp = 0;
          });
          setTimeout(() => {
            room.players.forEach(player => {
              player.clickable = true;
            });
          }, clickableTime);
          broadcastClickable(room, clickableTime);
          break;

        case "click":
          const clickPlayer = room.players.find(p => p.name === data.name);
          if (!clickPlayer) {
            console.error(`Player ${data.name} not found in room`);
            return;
          }
          console.log(`Click player: ${clickPlayer.name}`);
          if (clickPlayer.clickable) {
            clickPlayer.clickedTimestamp = data.timestamp;
            clickPlayer.clickable = false;
            broadcastClick(room);
          }
          break;

        default:
          console.log("Unknown message type:", data.type);
      }

    } catch (e) {
      console.error("Error processing message:", e);
    }
  }
})

app.listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
