/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRIDHOOK_ADDRESS_UNICHAIN: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_UNICHAIN: string;
  readonly VITE_RPC_URL_UNICHAIN: string;

  readonly VITE_GRIDHOOK_ADDRESS_MAINNET: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_MAINNET: string;
  readonly VITE_RPC_URL_MAINNET: string;

  readonly VITE_GRIDHOOK_ADDRESS_BNB: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_BNB: string;
  readonly VITE_RPC_URL_BNB: string;

  readonly VITE_GRIDHOOK_ADDRESS_BASE: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_BASE: string;
  readonly VITE_RPC_URL_BASE: string;

  readonly VITE_GRIDHOOK_ADDRESS_ARBITRUM: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_ARBITRUM: string;
  readonly VITE_RPC_URL_ARBITRUM: string;

  readonly VITE_GRIDHOOK_ADDRESS_OPTIMISM: string;
  readonly VITE_SWAP_ROUTER_ADDRESS_OPTIMISM: string;
  readonly VITE_RPC_URL_OPTIMISM: string;

  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
