import { WebSocket, WebSocketServer } from "ws";
import { RoomManager, type GameRoom } from "./room.js";
import type { ClientToServer, ServerToClient } from "@tcgl/core";

type SocketContext = { room: GameRoom; playerId: string; roomId: string };

/**
 * Binds a `ws` `WebSocketServer` to a `RoomManager`. First message from a client should be
 * `{ type: "join", roomId, playerId }`.
 */
export function attachGateway(
  wss: WebSocketServer,
  manager: RoomManager
): void {
  wss.on("connection", (ws: WebSocket) => {
    let ctx: SocketContext | null = null;
    const send = (m: ServerToClient) => {
      ws.send(JSON.stringify(m));
    };
    ws.on("message", (data) => {
      let msg: ClientToServer;
      try {
        msg = JSON.parse(String(data)) as ClientToServer;
      } catch {
        return;
      }
      if (msg.type === "join") {
        const room = manager.getOrCreate(msg.roomId);
        ctx = { room, playerId: msg.playerId, roomId: msg.roomId };
        room.addClient(msg.playerId, { send });
        return;
      }
      if (msg.type === "ping") {
        send({ type: "pong", t: msg.t });
        return;
      }
      if (!ctx) {
        return;
      }
      if (msg.type === "dispatch") {
        const out = ctx.room.handle(ctx.playerId, msg);
        if (!out) {
          return;
        }
        if (out.type === "patch" && out.error) {
          send(out);
        } else if (out.type === "patch" && !out.error) {
          ctx.room.broadcast(out);
        } else {
          send(out);
        }
      }
    });
    ws.on("close", () => {
      if (ctx) {
        ctx.room.removeClient(ctx.playerId);
      }
    });
  });
}

export function startGateway(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const manager = new RoomManager();
  attachGateway(wss, manager);
  return wss;
}
