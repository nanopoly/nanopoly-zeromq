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
        this._name = this.constructor.name.toLowerCase();
    }

    /**
     * @description handles pub/sub communication with servers
     * @param {String} status subscription channel
     * @param {String} msg published message
     * @memberof Client
     */
    async _onStateChange(status, msg) {
        if (this._id !== msg.id) {
            if (status === 'push') {
                if (!this._pair[msg.id]) {
                    this._logger.info(`push received from ${ msg.id }`, this._name, this._id);
                    const pull = new Socket('pull', msg.sock);
                    pull.handle('error', e => this.logger.error(e, this._name, this._id));
                    pull.handle(p => this._onMessage(p));
                    pull.connect(msg.port, msg.ip, 'connect');

                    let push, port;
                    try {
                        port = await portfinder.getPortPromise({ port: this._options.port });
                        push = new Socket('push');
                        push.handle('error', e => this.logger.error(e, this._name, this._id));
                        push.connect(port, this._ip, 'bindSync');

                        this._push[push._address] = push;
                        this._pull[pull._address] = pull;
                        this._options.port = port;
                        this._pair[msg.id] = [ push._address, pull._address, Date.now() ];
                        this._publisher.publish('client-push', JSON.stringify({ id: this._id,
                            ip: this._ip, port, sock: push._id.split('/').pop(), address: pull._address }));
                    } catch (e) {
                        this._logger.error(e, this._name, this._id);
                    }
                } else this._logger.info(`${ msg.id } already paired`, this._name, this._id);
            } else if (status === 'ping') {
                if (this._pair[msg.id]) {
                    this._logger.info(`ping received from ${ msg.id }`, this._name, this._id);
                    this._pair[msg.id][2] = Date.now();
                } else this._logger.info(`ping received from unknown server(${ msg.id })`, this._name, this._id);
            }
        }
    }

    /**
     * @description handler for received messages
     * @param {String} p message
     * @memberof Client
     */
    _onMessage(p) {
        const m = this._parseMessage(p);
        const address = this._push[this._pair[m._][0]]._address;
        if (m.e) {
            this._logger.error(p, m.e, this._name, this._id);
            this.send(address, m);
        } else this._handler(m).catch(async e => this._logger.error(p, e.message, this._name, this._id));
    }

    /**
     * @description initiates pairing connections with servers
     * @param {Function} handler message handler
     * @memberof Client
     */
    start(handler) {
        if (is.not.function(handler) || handler.constructor.name !== 'AsyncFunction')
            throw new Error('handler must be an async function');

        this._handler = handler;
        this._subscriber.subscribe('server-ping');
        this._subscriber.subscribe('server-push');
        this._subscriber.on('message', (ch, msg) => {
            try {
                msg = JSON.parse(msg);
                if (is.object(msg)) this._onStateChange(ch.split('-').pop(), msg, handler);
            } catch (e) {
                this._logger.error(e, this._name, this._id);
            }
        });
        this._publisher.publish('client-init', JSON.stringify({ id: this._id, ip: this._ip }));
    }
}

module.exports = Client;
