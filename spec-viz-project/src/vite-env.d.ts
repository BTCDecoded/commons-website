/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute URL to `protocol.html` when `../protocol.html` is wrong (e.g. local Vite only). */
  readonly VITE_ORANGE_PAPER_PROTOCOL_URL?: string;
  /** Optional absolute URL to `architecture.html` when the default sibling path is wrong. */
  readonly VITE_ORANGE_PAPER_ARCHITECTURE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
