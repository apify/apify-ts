/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Layout from '@theme/Layout';

const React = require('react');

const CompLibrary = {
    Container: (props) => <div {...props}></div>,
    GridBlock: (props) => <div {...props}></div>,
    MarkdownBlock: (props) => <div {...props}></div>,
};

const { Container } = CompLibrary;

const siteConfig = require('../../docusaurus.config.js');

class Users extends React.Component {
    render() {
        if ((siteConfig.customFields.users ?? []).length === 0) {
            return null;
        }

        const editUrl = `${siteConfig.customFields.repoUrl}/edit/master/website/siteConfig.js`;
        const showcase = siteConfig.customFields.users.map((user) => (
            <a href={user.infoLink} key={user.infoLink}>
                <img src={user.image} alt={user.caption} title={user.caption} />
            </a>
        ));

        return (
            <div className="mainContainer">
                <Container padding={['bottom', 'top']}>
                    <div className="showcaseSection">
                        <div className="prose">
                            <h1>Who is Using This?</h1>
                            <p>This project is used by many folks</p>
                        </div>
                        <div className="logos">{showcase}</div>
                        <p>Are you using this project?</p>
                        <a href={editUrl} className="button">
                            Add your company
                        </a>
                    </div>
                </Container>
            </div>
        );
    }
}

export default (props) => (
    <Layout>
        <Users {...props} />
    </Layout>
);
