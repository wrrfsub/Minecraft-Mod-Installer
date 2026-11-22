import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('mods', () => import('./screens/Mods'), {
            visible: ({ server, config }) => !(Array.isArray(config.eggs) && config.eggs.length > 0) || !!server?.attributes.egg_tags?.includes('mod-installer'),
        });
    },
});
