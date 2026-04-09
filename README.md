# inGrid: Uniswap V4 Grid Hook — Web Interface

## Overview

This repository is the **GUI / front-end companion** to the [uni-grid-contracts-v4](https://github.com/ttymarucr/uni-grid-contracts-v4/) smart contracts. It provides a single-page web application that lets users interact with the on-chain `GridHook` singleton through a browser wallet — configuring grids, deploying liquidity, rebalancing, authorizing keepers, and closing positions — without writing any Solidity or using a CLI.

For full details on the smart contract architecture, hook model, fee settlement, typed errors, and deployment addresses, see the [contracts README](https://github.com/ttymarucr/uni-grid-contracts-v4/blob/master/README.md).

## Tech Stack

- **Svelte 4** — reactive UI framework
- **Vite** — build tooling and dev server
- **Tailwind CSS 4** — utility-first styling
- **viem** — low-level Ethereum client (ABI encoding, contract reads/writes)
- **@wagmi/core + @wagmi/connectors** — wallet connection and chain management
- **Chart.js** — grid distribution visualization
- **svelte-spa-router** — client-side hash routing
- **TypeScript** — type-safe application code

## Features

- **Wallet Connection**: Connect via browser wallets (MetaMask, WalletConnect, etc.) through Wagmi connectors.
- **Grid Configuration**: Set grid spacing, order count, distribution type, rebalance threshold, and slippage bounds through a guided form.
- **Grid Deployment**: Approve tokens via Permit2 and deploy a grid in a single flow, with slippage and deadline protection.
- **Rebalance & Close**: Rebalance or close existing grids directly from the UI.
- **Keeper Management**: Authorize or revoke keeper addresses for automated rebalancing.
- **Distribution Preview**: Visualize liquidity distribution weights (flat, linear, reverse linear, Fibonacci, sigmoid, logarithmic) with Chart.js before deploying.
- **On-Chain State**: Read grid configuration, pool state, user state, live orders, and planned weights from the contract.
- **Toast Notifications**: Transaction status feedback via toast messages.

## Architecture

```
src/
├── App.svelte              # Root component
├── main.js                 # Entry point
├── app.css                 # Global styles
├── lib/
│   ├── routes.ts           # SPA route definitions
│   ├── components/         # Svelte UI components
│   ├── contracts/          # ABI definitions and contract addresses
│   ├── icons/              # Icon components
│   ├── stores/             # Svelte stores
│   │   ├── gridController.ts  # Grid interaction logic (deploy, rebalance, close, config)
│   │   ├── wallet.ts          # Wallet connection state
│   │   └── toasts.ts         # Notification store
│   └── wagmi/              # Wagmi client and connector setup
```

## Development

Install dependencies:

```sh
yarn install
```

Start the dev server:

```sh
yarn dev
```

Build for production:

```sh
yarn build
```

Preview the production build:

```sh
yarn preview
```

## Dependencies

- `svelte` / `@sveltejs/vite-plugin-svelte`
- `vite`
- `tailwindcss` / `@tailwindcss/vite`
- `viem`
- `@wagmi/core` / `@wagmi/connectors`
- `chart.js`
- `svelte-spa-router`
- `lucide-svelte` / `@iconify/svelte`
- `typescript`

## Related

- **Smart Contracts**: [uni-grid-contracts-v4](../uni-grid-contracts-v4) — Solidity implementation of the GridHook singleton, deployment scripts, and tests.

## Contributing

Contributions are welcome! Please submit issues or pull requests to help improve the project. For major changes, please open an issue first to discuss your ideas.

## Disclaimer

This software is provided **"as is"**, without warranty of any kind, express or implied. This project is a **practical example and educational resource** for grid trading on Uniswap V4. It is **not** financial advice. Users are solely responsible for their own due diligence and bear all risks associated with the use of this software. See the [contracts README](../uni-grid-contracts-v4/README.md#disclaimer) for the full disclaimer.

## License

This project is licensed under the [MIT License](LICENSE).