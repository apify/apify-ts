import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
import { prompt } from 'inquirer';
import colors from 'ansi-colors';
import { fetchManifest } from '@crawlee/templates';

export async function fetchTemplates() {
    // TODO always fetch from master
    return ['cheerio-ts', 'playwright-ts', 'puppeteer-ts', 'cheerio-js', 'playwright-js', 'puppeteer-js'];
}

interface CreateProjectArgs {
    name?: string;
    template?: string;
}

function validateProjectName(name: string) {
    if (name.length === 0) {
        throw new Error('The project name cannot be empty string.');
    }
}

export class CreateProjectCommand<T> implements CommandModule<T, CreateProjectArgs> {
    command = 'create <project-name>';
    describe = 'Creates a new Crawlee project directory from a selected boilerplate template.';
    builder = async (args: Argv) => {
        args.positional('project-name', {
            describe: 'Name of the new project folder.',
        });
        args.option('template', {
            alias: 't',
            choices: await fetchTemplates(),
            describe: 'Template for the project. If not provided, the command will prompt for it.',
        });
        return args as Argv<CreateProjectArgs>;
    };

    /**
     * @inheritDoc
     */
    async handler(args: ArgumentsCamelCase<CreateProjectArgs>) {
        let { name: projectName } = args;
        let templateName = args.template;

        // Check proper format of projectName
        if (!projectName) {
            const projectNamePrompt = await prompt([{
                name: 'projectName',
                message: 'Name of the new project folder:',
                type: 'input',
                validate: (promptText) => {
                    try {
                        validateProjectName(promptText);
                    } catch (err: any) {
                        return err.message;
                    }
                    return true;
                },
            }]);
            ({ projectName } = projectNamePrompt);
        } else {
            validateProjectName(projectName);
        }

        const manifest = await fetchManifest();
        const choices = manifest.templates.map((t) => ({
            value: t.name,
            name: t.description,
        }));

        if (!templateName) {
            const answer = await prompt([{
                type: 'list',
                name: 'template',
                message: 'Please select the template for your new Crawlee project',
                default: choices[0],
                choices,
            }]);
            templateName = answer.template;
        }

        const projectDir = join(process.cwd(), projectName!);

        // Create project directory structure
        try {
            mkdirSync(projectDir);
        } catch (err: any) {
            if (err.code && err.code === 'EEXIST') {
                // eslint-disable-next-line no-console
                console.error(`Cannot create new Crawlee project, directory '${projectName}' already exists.`);
                return;
            }
            throw err;
        }

        // eslint-disable-next-line no-console
        console.log(templateName);

        // const templateObj = manifest.templates.find((t) => t.name === templateName);
        // const { archiveUrl } = templateObj;
        //
        // const zipStream = await gotScraping({
        //     url: archiveUrl,
        //     isStream: true,
        // });
        // const unzip = unzipper.Extract({ path: projectDir });
        // await zipStream.pipe(unzip).promise();

        // TODO? at least the project name yes
        // await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: projectName, template: templateName }), projectDir);
        // await setLocalEnv(projectDir);
        // await updateLocalJson(join(projectDir, 'package.json'), { name: projectName });

        // Run npm install in project dir.
        // For efficiency, don't install Puppeteer for templates that don't use it

        const npm = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
        execSync(`${npm} install`, { cwd: projectDir });
        // const cmdArgs = ['install'];
        // if (templateObj.skipOptionalDeps) cmdArgs.push('--no-optional');
        // await execWithLog(getNpmCmd(), cmdArgs, { cwd: projectDir });

        // eslint-disable-next-line no-console
        console.log(colors.green(`Project ${projectName} was created. To run it, run "cd ${projectName}" and "crawlee run".`));
    }
}
