const fs = require('fs-extra');
const path = require('path');
const prettier = require('prettier'); // eslint-disable-line
const got = require('got');
const prettierConfig = require('./docs-prettier.config');
const sidebars = require('../sidebars.json');

const DOCS_DIR = path.join(__dirname, '..', '..', 'docs');
const EXAMPLES_DIR_NAME = path.join(DOCS_DIR, 'examples');
// TODO remove custom branch once we merge it to master
const EXAMPLES_REPO = 'https://api.github.com/repos/apify/actor-templates/contents/dist/examples?ref=feat/docusaurus-v2';

async function getExamplesFromRepo() {
    await fs.emptyDir(EXAMPLES_DIR_NAME);
    process.chdir(EXAMPLES_DIR_NAME);
    const body = await got(EXAMPLES_REPO).json();
    const builtExamples = await buildExamples(body);
    await addExamplesToSidebars(builtExamples);
}

async function buildExamples(exampleLinks) {
    const examples = [];
    for (const example of exampleLinks) {
        const fileContent = await got(example.download_url).text();
        console.log(`Rendering example ${example.name}`);
        const markdown = prettier.format(fileContent, prettierConfig);
        fs.writeFileSync(example.name, markdown);
        const exampleName = example.name.split('.')[0];
        examples.push(`examples/${exampleName.replace(/_/g, '-')}`);
    }
    return examples;
}

async function addExamplesToSidebars(examples) {
    console.log('Saving examples to sidebars.json');
    sidebars.docs.Examples = examples;
    fs.writeFileSync(
        path.join(__dirname, '..', 'sidebars.json'),
        JSON.stringify(sidebars, null, 4),
    );
}

const main = async () => {
    await getExamplesFromRepo();
};

main().then(() => console.log('All docs built successfully.'));
