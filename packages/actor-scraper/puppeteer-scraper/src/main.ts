import { runActor } from '@apify/scraper-tools';
import { CrawlerSetup } from './internals/crawler_setup';

runActor(CrawlerSetup);
