import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['test/audioTranscription.spec.ts'], testTimeout: 15000 } });
