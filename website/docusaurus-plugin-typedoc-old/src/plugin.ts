import { LoadContext } from '@docusaurus/types';
import * as path from 'path';
import { Application } from 'typedoc';
import { load } from 'typedoc-plugin-markdown';
import { getPluginOptions } from './options';
import { bootstrap, removeDir } from './render';
import { PluginOptions } from './types';

// store list of plugin ids when running multiple instances
const apps: string[] = [];

export default async function pluginDocusaurus(
  context: LoadContext,
  opts: Partial<PluginOptions>,
) {
  if (opts.id && !apps.includes(opts.id)) {
    apps.push(opts.id);

    const { siteDir } = context;

    const options = getPluginOptions(opts);

    const outputDir = path.resolve(siteDir, options.docsRoot, options.out);

    removeDir(outputDir);

    const app = new Application();

    app.options.setValue('theme', path.resolve(__dirname));

    load(app);

    bootstrap(app, options);

    const project = app.convert();

    // if project is undefined typedoc has a problem - error logging will be supplied by typedoc.
    if (!project) {
      return undefined;
    }

    if (options.watch) {
      app.convertAndWatch(async (project) => {
        await app.generateDocs(project, outputDir);
      });
    } else {
      await app.generateDocs(project, outputDir);
    }
  }

  return {
    name: 'docusaurus-plugin-typedoc',
  };
}
