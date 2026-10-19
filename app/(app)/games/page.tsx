import type { Metadata } from "next";
import { MyGames } from "@/components/my-games";

export const metadata: Metadata = { title: "My Games" };

export default function GamesPage() {
  return <MyGames />;
}
