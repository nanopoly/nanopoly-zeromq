'use strict';

const Base = require('../lib/base');
const { Client, Server } = require('../index');

const base = new Base({ prefix: 'a' });
const client = new Client({ log: 'debug' });
const server = new Server({ log: 'debug' });

describe('zeromq transport layer', () => {
    let payload = Date.now();

    beforeAll(done => {
        server.start(async m => m.d);
        setTimeout(done, 1000);
    });

    afterAll(() => {
        base.stop();
        client.stop();
        server.stop();
    });

    test('ping / pong', async done => {
        client.start(async r => {
            expect(r.d).toBe(payload);
            done();
        });
        setTimeout(() => {
            let address;
            for (let id in client._pair) address = client._pair[id][0];
            client.send(address, { d: payload });
        }, 1500);
    });

    test('invalid address', async done => {
        expect(() => client.send('test', { d: payload })).toThrow();
        done();
    });

    test('invalid address', async () => {
        expect(base._channel('b')).toBe('a-b');
    });
});
