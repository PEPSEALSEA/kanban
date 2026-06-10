import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const BASE_PATH = '/kanban';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StudyFlow - Homework Sorter',
    short_name: 'StudyFlow',
    description: 'Organize your workflow with style.',
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: 'standalone',
    orientation: 'any',
    background_color: '#bae6fd',
    theme_color: '#bae6fd',
    icons: [
      {
        src: `${BASE_PATH}/icon.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${BASE_PATH}/apple-icon.png`,
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${BASE_PATH}/icon.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
