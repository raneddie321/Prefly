export type Locale = "en" | "he";
export type GameMode = "auto" | "2d" | "3d";

export interface SpriteSpec {
  id: string;
  description: string;
  width: number;
  height: number;
}

export interface GameAsset extends SpriteSpec {
  svg: string;
}

export type AssetMap = Record<string, GameAsset>;

export interface GamePlan {
  title: string;
  tagline: string;
  emoji: string;
  palette: string[];
  dimension: "2d" | "3d";
  multiplayer: boolean;
  genre: string;
  summary: string;
  coreLoop: string;
  controls: { desktop: string; touch: string };
  mechanics: string[];
  progression: string;
  artDirection: string;
  audio: string;
  sprites: SpriteSpec[];
  techNotes: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  emoji: string;
  palette: string[];
  mode: GameMode;
  multiplayer: boolean;
  plan: GamePlan | null;
  html: string | null;
  assets: AssetMap;
  is_public: boolean;
  published_at: string | null;
  author_name: string | null;
  play_count: number;
  remixed_from: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectSummary = Pick<
  Project,
  "id" | "title" | "description" | "emoji" | "palette" | "is_public" | "play_count" | "updated_at" | "author_name" | "multiplayer"
>;

export const PROJECT_SUMMARY_COLUMNS =
  "id,title,description,emoji,palette,is_public,play_count,updated_at,author_name,multiplayer";

export interface ProjectMessage {
  id: number;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  meta: { kind?: "fix" | "error"; image?: boolean; issues?: number; agents?: StageId[] };
  created_at: string;
}

export interface ProjectVersion {
  id: number;
  project_id: string;
  summary: string;
  created_at: string;
}

export interface RuntimeError {
  kind: string;
  message: string;
  line?: number;
  col?: number;
  stack?: string;
}

export interface ImageInput {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string; // base64, no data: prefix
}

export type StageId = "design" | "graphics" | "code" | "qa" | "fix" | "save";

/** Events streamed (as NDJSON) from /api/generate to the studio. */
export type GenerationEvent =
  | { type: "stage"; stage: StageId; status: "start" | "done" | "failed"; detail?: string }
  | { type: "plan"; plan: GamePlan }
  | { type: "thinking"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "done"; html: string; assets: AssetMap; message: string; title: string; emoji: string; palette: string[]; versionId: number | null; remaining?: number }
  | { type: "error"; message: string; code?: string };
