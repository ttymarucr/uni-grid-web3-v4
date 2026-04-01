import { createConfig, http } from '@wagmi/core';
import { injected } from '@wagmi/connectors';
import { ethereum, unichain, arbitrum, base, bnb } from './config';

export const config = createConfig({
  chains: [ethereum, unichain, arbitrum, base, bnb],
  connectors: [injected()],
  transports: {
    [ethereum.id]: http(),
    [unichain.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [bnb.id]: http(),
  },
});
