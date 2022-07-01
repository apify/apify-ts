import { Server as ProxyChainServer } from 'proxy-chain';

let i = 0;

// --proxy-bypass-list=<-loopback> for launching Chrome
export const createProxyServer = (localAddress: string, username: string, password: string): ProxyChainServer => {
    return new ProxyChainServer({
        port: 1234 + i++,
        prepareRequestFunction: (input) => {
            console.log('waaaaaaat', input);
            return {
                localAddress,
                requestAuthentication: input.username !== username || input.password !== password,
            };
        },
    });
};
