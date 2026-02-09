import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: {
    resolve: true,
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@dnd-kit/core', '@dnd-kit/utilities'],
  treeshake: true,
  minify: false,
  outDir: 'dist',
  tsconfig: './tsconfig.lib.json',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});

