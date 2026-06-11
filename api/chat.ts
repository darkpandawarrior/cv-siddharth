import { handleChat } from "./_lib/chat-handler";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleChat(request);
}
