import { createConfig, http } from '@wagmi/core';
import { injected } from '@wagmi/connectors';
import { unichain } from './config';

export const config = createConfig({
  chains: [unichain],
  connectors: [injected()],
  transports: {
    [unichain.id]: http(),
  },
});
