import type { ComponentType } from "react";
import type { Ack, RoomView } from "../../shared/protocol";

export interface SettingsFormProps {
  settings: unknown;
  /** Only the host can change settings. */
  editable: boolean;
  onChange: (settings: unknown) => void;
}

export interface BoardProps {
  room: RoomView;
  playerId: string;
  /** serverTime − local time, in ms. */
  clockOffset: number;
  sendAction: (action: unknown) => Promise<Ack>;
}

/** Client side of a game. The main menu and room pages are built from these. */
export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  SettingsForm: ComponentType<SettingsFormProps>;
  /** Shows the running game, and the result once it's over. */
  Board: ComponentType<BoardProps>;
}
