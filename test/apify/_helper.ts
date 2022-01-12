import fs from 'fs-extra';
import { ENV_VARS } from '@apify/consts';
import { Application } from 'express';
import { Server } from 'http';

// Log unhandled rejections.
// process.on('unhandledRejection', (err) => {
//     console.log('----------------------------------------------------------------');
//     console.log('- ERROR: Exiting tests because of unhandled promise rejection! -');
//     console.log('----------------------------------------------------------------');
//     console.log(err);
//     process.exit(1);
// });

export const expectNotUsingLocalStorage = () => expect(process.env[ENV_VARS.LOCAL_STORAGE_DIR]).toBeUndefined();

export const expectDirEmpty = (dirPath: string) => {
    const content = fs.readdirSync(dirPath);
    expect(content).toHaveLength(0);
};

export const expectDirNonEmpty = (dirPath: string) => {
    const content = fs.readdirSync(dirPath);
    expect(content).not.toHaveLength(0);
};

export const startExpressAppPromise = (app: Application, port: number) => {
    return new Promise<Server>((resolve) => {
        const server = app.listen(port, () => resolve(server));
    });
};
