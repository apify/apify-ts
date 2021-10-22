import {
    BindOption,
    DeclarationReflection,
    PageEvent,
    ParameterReflection,
    ReflectionKind,
    Renderer,
    RendererEvent,
    UrlMapping,
} from 'typedoc';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import { MarkdownTheme } from 'typedoc-plugin-markdown/dist/theme';
import { getKindPlural } from 'typedoc-plugin-markdown/dist/groups';
import * as path from 'path';

import { FrontMatter, SidebarOptions } from './types';
import {
    prependYAML,
} from 'typedoc-plugin-markdown/dist/utils/front-matter';
import { escapeChars } from 'typedoc-plugin-markdown/dist/utils';

const CATEGORY_POSITION = {
    [ReflectionKind.Module]: 1,
    [ReflectionKind.Namespace]: 1,
    [ReflectionKind.Class]: 2,
    [ReflectionKind.Interface]: 3,
    [ReflectionKind.TypeAlias]: 4,
    [ReflectionKind.Enum]: 5,
    [ReflectionKind.Function]: 6,
    [ReflectionKind.Variable]: 7,
    [ReflectionKind.ObjectLiteral]: 8,
};

export class DocusaurusTheme extends MarkdownTheme {
    @BindOption('sidebar')
    sidebar!: SidebarOptions;

    @BindOption('readmeTitle')
    readmeTitle!: string;

    constructor(renderer: Renderer) {
        super(renderer);

        this.listenTo(this.application.renderer, {
            [PageEvent.END]: this.onPageEnd,
            [RendererEvent.END]: this.onRendererEnd,
        });

        registerPartials();
    }

    override getRelativeUrl(url: string) {
        const relativeUrl = super.getRelativeUrl(url).replace(/.md/g, '');
        if (path.basename(relativeUrl).startsWith('index')) {
            return relativeUrl.replace('index', '');
        }
        return relativeUrl;
    }

    onPageEnd(page: PageEvent<DeclarationReflection>) {
        if (page.contents) {
            page.contents = prependYAML(page.contents, this.getYamlItems(page));
        }
    }

    onRendererEnd(renderer: RendererEvent) {
        writeCategoryYaml(
            renderer.outputDirectory,
            this.sidebar.categoryLabel,
            this.sidebar.position,
        );

        Object.keys(groupUrlsByKind(this.getUrls(renderer.project))).forEach(
            (group) => {
                const kind = parseInt(group);
                const mapping = this.mappings.find((mapping) =>
                    mapping.kind.includes(kind),
                );
                if (mapping) {
                    writeCategoryYaml(
                        renderer.outputDirectory + '/' + mapping.directory,
                        getKindPlural(kind),
                        CATEGORY_POSITION[kind],
                    );
                }
            },
        );
    }

    getYamlItems(page: PageEvent<DeclarationReflection>): any {
        const pageId = this.getId(page);
        const pageTitle = this.getTitle(page, pageId);
        const sidebarLabel = this.getSidebarLabel(page);
        const sidebarPosition = this.getSidebarPosition(page);
        let items: FrontMatter = {
            id: pageId,
            title: pageTitle,
        };
        if (page.url === this.entryDocument) {
            items = {
                ...items,
                slug: `/${path.relative(process.cwd(), this.out).replace(/\\/g, '/')}/`,
            };
        }
        if (sidebarLabel && sidebarLabel !== pageTitle) {
            items = { ...items, sidebar_label: sidebarLabel as string };
        }
        if (sidebarPosition) {
            items = { ...items, sidebar_position: parseFloat(sidebarPosition) };
        }
        if (page.url === page.project.url && this.entryPoints.length > 1) {
            items = { ...items, hide_table_of_contents: true };
        }
        return {
            ...items,
            custom_edit_url: null,
        };
    }

    getSidebarLabel(page: PageEvent<DeclarationReflection>) {
        const indexLabel =
            this.sidebar.indexLabel ||
            (this.entryPoints.length > 1 ? 'Table of contents' : 'Apify');
            // (this.entryPoints.length > 1 ? 'Table of contents' : 'Exports');

        if (page.url === this.entryDocument) {
            return page.url === page.project.url
                ? indexLabel
                : this.sidebar.readmeLabel;
        }

        if (page.url === this.globalsFile) {
            return indexLabel;
        }

        return this.sidebar.fullNames ? page.model.getFullName() : page.model.name;
    }

    getSidebarPosition(page: PageEvent<DeclarationReflection>) {
        if (page.url === this.entryDocument) {
            return page.url === page.project.url ? '0.5' : '0';
        }
        if (page.url === this.globalsFile) {
            return '0.5';
        }
        if (page.model.getFullName().split('.').length === 1) {
            return '0';
        }
        return null;
    }

    getId(page: PageEvent) {
        return path.basename(page.url, path.extname(page.url));
    }

    private getPageTitle(page: PageEvent<any>, pageId: string, shouldEscape = true) {
        const title: string[] = [''];
        if (
            page.model &&
            page.model.kindString &&
            page.url !== page.project.url
        ) {
            // title.push(`${page.model.kindString}: `);
        }
        if (page.url === page.project.url) {
            title.push(this.indexTitle || page.project.name);
        } else {
            if (pageId.includes('.')) {
                title.unshift(pageId.substr(0, pageId.lastIndexOf('.') + 1));
            }

            title.push(
                shouldEscape ? escapeChars(page.model.name) : page.model.name,
            );
            if (page.model.typeParameters) {
                const typeParameters = page.model.typeParameters
                    .map((typeParameter: ParameterReflection) => typeParameter.name)
                    .join(', ');
                title.push(`<${typeParameters}${shouldEscape ? '\\>' : '>'}`);
            }
        }
        return title.join('');
    }

    getTitle(page: PageEvent, pageId: string) {
        const readmeTitle = this.readmeTitle || page.project.name;

        if (page.url === this.entryDocument && page.url !== page.project.url) {
            return readmeTitle;
        }

        return this.getPageTitle(page, pageId, false);
    }

    override get mappings() {
        return [
            {
                kind: [ReflectionKind.Module],
                isLeaf: false,
                directory: 'modules',
                template: this.getReflectionTemplate(),
            },
            {
                kind: [ReflectionKind.Namespace],
                isLeaf: false,
                directory: 'namespaces',
                template: this.getReflectionTemplate(),
            },
            {
                kind: [ReflectionKind.Enum],
                isLeaf: false,
                directory: 'enums',
                template: this.getReflectionTemplate(),
            },
            {
                kind: [ReflectionKind.Class],
                isLeaf: false,
                directory: 'classes',
                template: this.getReflectionTemplate(),
            },
            {
                kind: [ReflectionKind.Interface],
                isLeaf: false,
                directory: 'interfaces',
                template: this.getReflectionTemplate(),
            },
            {
                kind: [ReflectionKind.TypeAlias],
                isLeaf: true,
                directory: 'types',
                template: this.getReflectionMemberTemplate(),
            },
        ];
    }

    override get globalsFile() {
        return 'modules.md';
    }
}

export function registerPartials() {
    const partialsFolder = path.join(__dirname, '../partials');
    const partialFiles = fs.readdirSync(partialsFolder);
    partialFiles.forEach((partialFile) => {
        const partialName = path.basename(partialFile, '.hbs');
        const partialContent = fs
            .readFileSync(partialsFolder + '/' + partialFile)
            .toString();
        Handlebars.registerPartial(partialName, partialContent);
    });
}

const writeCategoryYaml = (
    categoryPath: string,
    label: string,
    position: number | null,
) => {
    const yaml: string[] = [`label: "${label}"`];
    if (position !== null) {
        yaml.push(`position: ${position}`);
    }
    if (fs.existsSync(categoryPath)) {
        fs.writeFileSync(categoryPath + '/_category_.yml', yaml.join('\n'));
    }
};

const groupUrlsByKind = (urls: UrlMapping[]) => {
    return urls.reduce((r, v, _i, _a, k = v.model.kind) => ((r[k] || (r[k] = [])).push(v), r), {});
};
