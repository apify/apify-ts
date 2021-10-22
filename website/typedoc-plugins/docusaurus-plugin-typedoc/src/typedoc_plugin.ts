import { Application, Converter, Context } from 'typedoc';

export function load(app: Application) {
    console.log('load plugin', !!app);
    app.converter.on(Converter.EVENT_BEGIN, (context: Context) => {
        // rename `apify` to `Apify` on the docs HP
        context.project.name = 'Apify';
    });
}
