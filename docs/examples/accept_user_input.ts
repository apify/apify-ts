import { KeyValueStore } from 'crawlers';

const keyValueStore = await KeyValueStore.open();
const input = await keyValueStore.getValue('INPUT');

console.log(input);
