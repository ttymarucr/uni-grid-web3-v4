import { error } from '@sveltejs/kit';

export async function load({ params }) {
    try {
        // Load any necessary data for the layout here
        // For example, fetching user data or application settings

        return {
            // Return any data needed for the layout
        };
    } catch (err) {
        console.error(err);
        throw error(500, 'Failed to load layout data');
    }
}