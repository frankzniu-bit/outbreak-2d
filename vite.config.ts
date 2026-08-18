import { defineConfig, type Plugin } from 'vite';

/**
 * Inlines every built asset into index.html so the game ships as one file.
 *
 * Portals and site builders host a game as an upload or an iframe, and both
 * paths are far more reliable when there is nothing to resolve: no separate
 * /assets requests, no base-path assumptions, no MIME surprises. One file also
 * happens to be the easiest thing to hand a submissions reviewer.
 */
function singleFile(): Plugin {
  return {
    name: 'outbreak-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (c): c is typeof c & { type: 'asset'; fileName: string; source: string } =>
          c.type === 'asset' && c.fileName.endsWith('.html'),
      );
      if (!html) return;
      let source = String(html.source);

      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') {
          const tag = new RegExp(`<script[^>]*src="[^"]*${chunk.fileName}"[^>]*></script>`);
          source = source.replace(tag, `<script type="module">\n${chunk.code}\n</script>`);
          delete bundle[chunk.fileName];
        } else if (chunk.fileName.endsWith('.css')) {
          const link = new RegExp(`<link[^>]*href="[^"]*${chunk.fileName}"[^>]*>`);
          source = source.replace(link, `<style>\n${chunk.source}\n</style>`);
          delete bundle[chunk.fileName];
        }
      }
      html.source = source;
    },
  };
}

// The portal build drops co-op: its matchmaking needs an outside relay, and
// portal pages routinely block that, so a lobby that silently never connects is
// worse than no lobby button at all.
const portal = process.env.PORTAL === '1';

export default defineConfig({
  // relative, so the file works from a subdirectory, an iframe or a file:// open
  base: './',
  define: {
    __PORTAL_BUILD__: JSON.stringify(portal),
  },
  plugins: portal ? [singleFile()] : [],
  build: {
    outDir: portal ? 'dist-portal' : 'dist',
    assetsInlineLimit: portal ? 100_000_000 : 4096,
    cssCodeSplit: !portal,
  },
});
