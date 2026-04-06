import Home from '$lib/components/Home.svelte';
import Wizard from '$lib/components/Wizard.svelte';
import Profile from '$lib/components/Profile.svelte';
import Swap from '$lib/components/Swap.svelte';

export const routes = {
  '/': Home,
  '/wizard': Wizard,
  '/profile': Profile,
  '/swap': Swap,
};
