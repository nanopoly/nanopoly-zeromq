'use strict';

const Base = require('../lib/base');
const is = require('is_js');
const portfinder = require('portfinder');
const Socket = require('../lib/socket');

/**
 * @description zeromq transport layer for nanopoly
 * @extends Base
 * @class Client
 */
class Client extends Base {
    /**
     *Creates an instance of Client.
     * @param {Object} options transport options
     * @memberof Client
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

                    const port = await portfinder.getPortPromise({ port: this._options.port });
                    const push = new Socket('push');
                    push.handle('error', e => this.logger.error(e));
                    push.connect(port, this._ip, 'bindSync');
                    this._push[push._address] = push;

                    this._pair[msg.id] = [ push._address, pull._address, Date.now() ];
                    this._publisher.publish('client-push',
                        JSON.stringify({ id: this._id, ip: this._ip, port, sock: push._id.split('/').pop(), address: pull._address }));
                }
            } else if (status === 'ping') {
                if (this._pair[msg.id]) this._pair[msg.id][2] = Date.now();
            }
        }
    }

    async start(handler) {
        if (is.not.function(handler) || handler.constructor.name !== 'AsyncFunction')
            throw new Error('handler must be an async function');

        this._handler = handler;
        this._subscriber.subscribe('server-ping');
        this._subscriber.subscribe('server-push');
        this._subscriber.on('message', (channel, message) => {
            try {
                message = JSON.parse(message);
                if (is.not.object(message)) throw new Error('invalid message');
                this._onStateChange(channel.split('-').pop(), message, handler);
            } catch (e) {
                this._logger.error(e);
            }
        });
        this._publisher.publish('client-init', JSON.stringify({ id: this._id, ip: this._ip }));
    }
}

module.exports = Client;
