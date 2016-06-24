import * as watch from 'watch';
import * as wct from 'wct';
import * as minimatch from 'minimatch';
import * as events from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as wd from 'wd';

interface PluginOptions {

}

export const plugin: wct.PluginInterface = (
      wct: wct.Context, pluginOptions: PluginOptions) => {
  if (!wct.options.persistent) {
    // Watch only makes sense for a persistent browser.
    return;
  }
  const defaultGlobs = ['node_modules/**', 'bower_components/**']
      .map(f => path.resolve(path.join(process.cwd(), f)));
  const globs = getGlobsFromGitignore() || defaultGlobs;
  const detector = new ChangeDetector(process.cwd(), globs);

  const browsers = new Set<wd.Browser>();
  wct.on('browser-start', (defs: any, data: any, stats: any, browser: wd.Browser) => {
    browsers.add(browser);
  });

  detector.on('change-detected', () => {
    for (const browser of browsers) {
      browser.refresh(() => {});
    }
  });
};

class ChangeDetector extends events.EventEmitter {
  private basedir: string;
  private lastFiredAt = -Infinity;
  private debounceDuration = 0.2; // seconds
  constructor(basedir: string, ignoreGlobs: string[]) {
    super();
    this.basedir;

    watch.watchTree(basedir, {
      ignoreDotFiles: true,
      filter: makeFilterFunction(ignoreGlobs)
    }, () => {
      this.changeDetected();
    });
  }

  private changeDetected() {
    const time = process.uptime();
    if (time - this.lastFiredAt > this.debounceDuration) {
      this.emit('change-detected');
      this.lastFiredAt = time;
    }
  }

  close() {
    watch.unwatchTree(this.basedir);
  }
}

function getGlobsFromGitignore() {
  let currentPath = path.resolve(process.cwd());
  while (true) {
    try {
      return fs.readFileSync(path.join(currentPath, '.gitignore'), 'utf-8')
          .split('\n').filter((f) => !!f).map((f) => path.join(currentPath, f));
    } catch (error) { /* don't care */ }

    if (currentPath === path.dirname(currentPath)) {
      break;
    }
  }
}

function makeFilterFunction(globs: string[]) {
  const minimatchers = globs.map((g) => new minimatch.Minimatch(g));
  let filesWatched = 0;
  return (filename: string) => {
    const shouldSkip = minimatchers.some(
        (matcher) => matcher.match(path.resolve(filename)));
    if (!shouldSkip) {
      filesWatched++;
      debounce(() => console.log(`${filesWatched} files watched.`));
    }
    return !shouldSkip;
  };
}

let timeout: NodeJS.Timer = null;
function debounce(f: () => void) {
  if (timeout != null) {
    clearTimeout(timeout);
  }
  timeout = setTimeout(f, 1000);
}

// TODO(rictic): delete this once WCT is updated to expect plugins to give
//     named exports.
plugin['plugin'] = plugin;
module.exports = plugin;
