'use strict';

const Base = require('../lib/base');
const is = require('is_js');
const portfinder = require('portfinder');
const Socket = require('../lib/socket');

/**
 * @description zeromq transport layer for nanopoly
 * @extends Base
 * @class Server
 */
class Server extends Base {
    /**
     *Creates an instance of Server.
     * @param {Object} options transport options
     * @memberof Server
     */
    constructor(options) {
        super(options);
    }

    async _onStateChange(status, msg) {
        if (this._id !== msg.id) {
            if (status === 'push') {
                if (!this._pair[msg.id]) {
                    const pull = new Socket('pull', msg.sock);
                    pull.handle('error', e => this.logger.error(e));
                    pull.handle(p => this._onMessage(p));
                    pull.connect(msg.port, msg.ip, 'connect');
                    this._pull[pull._address] = pull;
                    this._pair[msg.id] = [ msg.address, pull._address, Date.now() ];
                }
            } else if (status === 'ping') {
                if (this._pair[msg.id]) this._pair[msg.id][2] = Date.now();
            } else {
                if (!this._pair[msg.id]) {
                    const port = await portfinder.getPortPromise({ port: this._options.port });
                    this._options.port = port;
                    const push = new Socket('push');
                    push.handle('error', e => this.logger.error(e));
                    push.connect(port, this._ip, 'bindSync');
                    this._push[push._address] = push;
                    this._publisher.publish('server-push',
                        JSON.stringify({ id: this._id, ip: this._ip, port, sock: push._id.split('/').pop() }));
                }
            }
        }
    }

    _onMessage(p) {
        try {
            const m = this._parseMessage(p);
            const address = this._push[this._pair[m._][0]]._address;
            if (m.e) {
                this._logger.error(p, m.e);
                this.send(address, m);
            } else {
                this._handler(m).then(async r => {
                    m.d = r;
                    this.send(address, m);
                }).catch(async e => {
                    m.e = e.message;
                    this.send(address, m);
                });
            }
        } catch (e) {
            this._logger.error(p, e.message);
        }
    }

    start(handler) {
        if (is.not.function(handler) || handler.constructor.name !== 'AsyncFunction')
            throw new Error('handler must be an async function');

        this._handler = handler;
        this._subscriber.subscribe('client-init');
        this._subscriber.subscribe('client-ping');
        this._subscriber.subscribe('client-push');
        this._subscriber.on('message', (ch, msg) => {
            try {
                msg = JSON.parse(msg);
                if (is.object(msg)) this._onStateChange(ch.split('-').pop(), msg, handler);
            } catch (e) {
                this._logger.error(e);
            }
        });
    }
}

module.exports = Server;
