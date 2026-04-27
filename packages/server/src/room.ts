import {
  createEmptyState,
  dispatch,
  type GameState,
  type GameAction,
} from "@tcgl/core";
import type { ClientToServer, ServerToClient } from "@tcgl/core";

type Client = { send: (msg: ServerToClient) => void };

export class GameRoom {
  readonly roomId: string;
  private state: GameState;
  private seq = 0;
  private clients = new Map<string, Client>();

  constructor(roomId: string) {
    this.roomId = roomId;
    this.state = createEmptyState(roomId, ["p1", "p2"], "p1");
  }

  addClient(playerId: string, client: Client) {
    this.clients.set(playerId, client);
    this.seq += 1;
    client.send({
      type: "welcome",
      roomId: this.roomId,
      playerId,
      state: this.state,
      seq: this.seq,
    });
  }

  removeClient(playerId: string) {
    this.clients.delete(playerId);
  }

  handle(
    playerId: string,
    msg: ClientToServer
  ): ServerToClient | null {
    if (msg.type === "ping") {
      return { type: "pong", t: msg.t };
    }
    if (msg.type === "join") {
      return null;
    }
    if (msg.type !== "dispatch") {
      return null;
    }
    if (msg.roomId !== this.roomId) {
      return {
        type: "patch",
        roomId: this.roomId,
        seq: this.seq,
        state: this.state,
        events: [],
        error: { code: "ROOM", message: "Room mismatch" },
      };
    }
    if (msg.playerId !== playerId) {
      return {
        type: "patch",
        roomId: this.roomId,
        seq: this.seq,
        state: this.state,
        events: [],
        error: { code: "AUTH", message: "Player id mismatch" },
      };
    }
    const r = dispatch(this.state, msg.action as GameAction);
    if (r.error) {
      const out: ServerToClient = {
        type: "patch",
        roomId: this.roomId,
        seq: this.seq,
        state: this.state,
        events: [],
        error: { code: r.error.code, message: r.error.message },
      };
      return out;
    }
    this.state = r.state;
    this.seq += 1;
    return {
      type: "patch",
      roomId: this.roomId,
      seq: this.seq,
      state: this.state,
      events: r.events,
    };
  }

  /** Fan-out a server message to every connected client. */
  broadcast(msg: ServerToClient) {
    for (const c of this.clients.values()) {
      c.send(msg);
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();

  getOrCreate(roomId: string): GameRoom {
    let r = this.rooms.get(roomId);
    if (!r) {
      r = new GameRoom(roomId);
      this.rooms.set(roomId, r);
    }
    return r;
  }
}
