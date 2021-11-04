import React from 'react';
import clsx from 'clsx';
import styles from './HomepageFeatures.module.css';

const FeatureList = [
  {
    title: 'Runs on JavaScript',
    Svg: require('../../static/img/javascript_logo.svg').default,
    description: (
      <>
          <b>JavaScript</b> is the language of the web. Apify SDK builds on popular tools like <a href='https://www.npmjs.com/package/playwright'>playwright</a>,
          <a href='https://www.npmjs.com/package/puppeteer'>puppeteer</a> and <a href='https://www.npmjs.com/package/cheerio'>cheerio</a>,
          to deliver <b>large-scale high-performance</b> web scraping and crawling of any website.
      </>
    ),
  },
  {
    title: 'Automates any web workflow',
    Svg: require('../../static/img/cloud_icon.svg').default,
    description: (
      <>
        Docusaurus lets you focus on your docs, and we&apos;ll do the chores. Go
        ahead and move your docs into the <code>docs</code> directory.
      </>
    ),
  },
  {
    title: 'Works on any system',
    Svg: require('../../static/img/cloud_icon.svg').default,
    description: (
      <>
          Apify SDK can be used <b>stand-alone</b> on your own systems or it can run as a <b>serverless microservice on the Apify Platform</b>.
          <a href='https://my.apify.com/actors'>Get started with Apify Platform</a>
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} alt={title} />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
