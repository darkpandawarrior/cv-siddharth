import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../App.tsx";

export const Route = createFileRoute("/")({
  component: HomePage,
});
