import * as fs from 'fs';
import {
  Application,
  MixedDeclarationOption,
  ParameterType,
  ProjectReflection,
  RendererEvent,
  StringDeclarationOption,
  TSConfigReader,
  TypeDocReader,
  UrlMapping,
} from 'typedoc';
import { PluginOptions } from './types';

export const bootstrap = (app: Application, options: PluginOptions) => {
  addTypedocReaders(app);
  addTypedocDeclarations(app);
  app.renderer.render = render;
  app.bootstrap(options);
};

async function render(project: ProjectReflection, outputDirectory: string) {
  const output = new RendererEvent(
    RendererEvent.BEGIN,
    outputDirectory,
    project,
  );
  output.urls = this.theme!.getUrls(project);
  this.trigger(output);
  if (!output.isDefaultPrevented) {
    output?.urls?.forEach((mapping: UrlMapping) => {
      this.renderDocument(output.createPageEvent(mapping));
    });

    this.trigger(RendererEvent.END, output);
  }
  this.theme = void 0;
}

const addTypedocReaders = (app: Application) => {
  app.options.addReader(new TypeDocReader());
  app.options.addReader(new TSConfigReader());
};

const addTypedocDeclarations = (app: Application) => {
  app.options.addDeclaration({
    name: 'id',
  } as StringDeclarationOption);

  app.options.addDeclaration({
    name: 'docsRoot',
  } as StringDeclarationOption);

  app.options.addDeclaration({
    name: 'siteDir',
  } as MixedDeclarationOption);

  app.options.addDeclaration({
    name: 'globalsTitle',
  } as StringDeclarationOption);

  app.options.addDeclaration({
    name: 'readmeTitle',
  } as StringDeclarationOption);

  app.options.addDeclaration({
    name: 'sidebar',
    type: ParameterType.Mixed,
  } as MixedDeclarationOption);
};

export function removeDir(path: string) {
  if (fs.existsSync(path)) {
    const files = fs.readdirSync(path);
    if (files.length > 0) {
      files.forEach(function (filename) {
        if (fs.statSync(path + '/' + filename).isDirectory()) {
          removeDir(path + '/' + filename);
        } else {
          fs.unlinkSync(path + '/' + filename);
        }
      });
      fs.rmdirSync(path);
    } else {
      fs.rmdirSync(path);
    }
  }
}
