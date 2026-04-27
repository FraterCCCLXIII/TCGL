import { startGateway } from "./gateway.js";

const port = Number(process.env.PORT) || 3456;
const wss = startGateway(port);
wss.on("listening", () => {
  // eslint-disable-next-line no-console
  console.log(`@tcgl/server WebSocket listening on ${port}`);
});
