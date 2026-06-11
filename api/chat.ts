import { handleChat } from "./_lib/chat-handler.ts";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleChat(request);
}
