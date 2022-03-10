import React from 'react';
// eslint-disable-next-line import/no-extraneous-dependencies
import { useDocsVersion } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const VersionedApiLink = ({ apiPath, children }) => {
    const version = useDocsVersion();
    const { siteConfig } = useDocusaurusContext();

    if (siteConfig.presets[0][1].docs.disableVersioning) {
        return (
            <a href={`${siteConfig.baseUrl}api/${apiPath}`}>
                {children}
            </a>
        );
    }

    return (
        <a href={`${siteConfig.baseUrl}api/${version.version === 'current' ? 'next' : version.version}/${apiPath}`}>
            {children}
        </a>
    );
};

export default VersionedApiLink;
