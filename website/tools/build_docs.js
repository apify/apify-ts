const fs = require('node:fs/promises');
const { basename } = require('node:path');
const path = require('path');
const sidebars = require('../sidebars.json');

const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'docs', 'examples');

async function updateExamplesSidebar() {
    const rawExamples = [];

    for await (const [filePath, filename] of walk(EXAMPLES_DIR)) {
        rawExamples.push([`examples/${filePath}`, filename]);
    }

    console.log(`Found ${rawExamples.length} examples to list`);

    // Sort files based on their file name, not folder path
    const sorted = rawExamples
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([filePath]) => filePath);

    await addExamplesToSidebars(sorted);

    return sorted;
}

async function* walk(dir, prefix = '') {
    const dirEntries = await fs.opendir(dir);

    for await (const entry of dirEntries) {
        if (entry.isDirectory()) {
            yield* walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
        } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
            const fileName = basename(entry.name.replaceAll('_', '-'), '.mdx');
            yield [`${prefix}${fileName}`, fileName];
        }
    }
}

async function addExamplesToSidebars(examples) {
    console.log('Saving examples to sidebars.json');
    sidebars.docs.Examples = examples;
    await fs.writeFile(
        path.join(__dirname, '..', 'sidebars.json'),
        JSON.stringify(sidebars, null, 4),
    );
}

const main = async () => {
    await updateExamplesSidebar();
};

main().then(() => console.log('Examples sidebar updated successfully.'));
