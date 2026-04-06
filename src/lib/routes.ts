import Home from '$lib/components/Home.svelte';
import Wizard from '$lib/components/Wizard.svelte';
import Profile from '$lib/components/Profile.svelte';

export const routes = {
  '/': Home,
  '/wizard': Wizard,
  '/profile': Profile,
};
