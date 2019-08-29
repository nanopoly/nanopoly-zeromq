'use strict';

const ZeroMQ = require('../index');

const server = new ZeroMQ('rep');
server.connect(3000, '127.0.0.1', 'bind');
server.handle(() => server.send('pong'));

const client = new ZeroMQ('req');
client.connect(3000, '127.0.0.1', 'connect');

describe('transport layer', () => {
    afterAll(() => {
        server.disconnect();
        client.disconnect();
    });

    test('ping / pong', async (done) => {
        client.handle(data => {
            expect(data.toString()).toBe('pong');
            done();
        });
        client.send('ping');
    });
});
