import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { readdir, readFile } from 'node:fs/promises';

export default {
  input: 'src/main.js',
  output: { file: 'dist/weather-chart-card.js', format: 'es', sourcemap: false },
  plugins: [
    {
      name: 'embedded-weather-icons',
      resolveId(id) { if (id === 'virtual:weather-icons') return '\0weather-icons'; },
      async load(id) {
        if (id !== '\0weather-icons') return;
        const styles = {};
        for (const [style, directory] of [['style1', 'icons'], ['style2', 'icons2']]) {
          styles[style] = {};
          for (const file of (await readdir(`src/${directory}`)).sort()) {
            if (!file.endsWith('.svg')) continue;
            const path = `src/${directory}/${file}`;
            this.addWatchFile(path);
            styles[style][file.slice(0, -4)] = 'data:image/svg+xml,' + encodeURIComponent(await readFile(path, 'utf8'));
          }
        }
        return `export default ${JSON.stringify(styles)};`;
      },
    },
    nodeResolve(),
    terser({ format: { comments: 'some' } }),
  ],
};
