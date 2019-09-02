'use strict';

const ZeroMQ = require('../index');

const client = new ZeroMQ({ log: 'fatal' });
const server = new ZeroMQ({ server: true, log: 'fatal' });

describe('zeromq transport layer', () => {
    let payload = Date.now();

    beforeAll(async done => {
        await server.start(async () => {
            return payload;
        });
        setTimeout(done, 1000);
    });

    afterAll(async done => {
        client.stop();
        server.stop();
        await server._registry.releasePort(server._options.port);
        await client._registry.releasePort(client._options.port);
        setTimeout(() => {
            client._registry.stop();
            server._registry.stop();
            done();
        }, 1000);
    });

    test('ping / pong', async done => {
        await client.start(async r => {
            expect(r.d).toBe(payload);
            done();
        });
        await client.send({ i: '127.0.0.1', p: server._options.port },
            { i: '127.0.0.1', p: client._options.port, d: payload });
    });
});
