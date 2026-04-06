/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRIDHOOK_ADDRESS_UNICHAIN: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_UNICHAIN: string;
  readonly VITE_RPC_URL_UNICHAIN: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
