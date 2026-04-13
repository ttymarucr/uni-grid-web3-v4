import { createConfig, http } from '@wagmi/core';
import { injected } from '@wagmi/connectors';
import { unichain, ethereum, bnb, base, arbitrum, optimism } from './config';

export const config = createConfig({
  chains: [unichain, ethereum, bnb, base, arbitrum, optimism],
  connectors: [injected()],
  transports: {
    [unichain.id]: http(),
    [ethereum.id]: http(),
    [bnb.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
  },
});
