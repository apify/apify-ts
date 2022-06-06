#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('yargonaut')
    .style('blue')
    .style('yellow', 'required')
    .helpStyle('green')
    .errorsStyle('red');

// eslint-disable-next-line
import { CreateProjectCommand } from './commands/CreateProjectCommand';
// eslint-disable-next-line
import { RunProjectCommand } from './commands/RunProjectCommand';

// eslint-disable-next-line
import yargs from 'yargs';

// eslint-disable-next-line
const { version } = require('../package.json');

const cli = yargs.scriptName('crawlee')
    .version(version)
    .usage('Usage: $0 <command> [options]')
    .example('$0 run --no-purge', 'Runs the project in current working directory and disables automatic purging of default storages')
    .alias('v', 'version')
    .alias('h', 'help')
    .command(new CreateProjectCommand())
    .command(new RunProjectCommand())
    .recommendCommands()
    .strict();

void (cli.parse(process.argv.slice(2)) as Promise<{ _: string[] }>)
    .then((args) => {
        if (args._.length === 0) {
            yargs.showHelp();
        }
    });
