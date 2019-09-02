'use strict';

const Clerq = require('clerq');
const is = require('is_js');
const pino = require('pino');
const shortid = require('shortid');
const Socket = require('./lib/socket');

/**
 * @description zeromq transport layer for nanopoly
 * @class NanopolyZeroMQ
 */
class NanopolyZeroMQ {
    /**
     *Creates an instance of NanopolyZeroMQ.
     * @param {Object} options transport options
     * @memberof NanopolyZeroMQ
     */
    constructor(options) {
        this.COMMAND_STOP = '¿§?';
        this._options = Object.assign({ log: 'error' }, is.object(options) && is.not.array(options) ? options : {});
        this._logger = pino({ level: this._options.log || process.env.LOG_LEVEL });
        this._registry = new Clerq(this._options.clerq || {});
    }

    /**
     * @description parses received message
     * @param {String} txt
     * @returns Object
     * @private
     * @memberof NanopolyZeroMQ
     */
    _parseMessage(txt) {
        let msg = {};
        try {
            msg = JSON.parse(txt);
            if (is.not.object(msg)) throw new Error(`invalid request: ${ txt }`);
            else if (is.not.string(msg._) || !shortid.isValid(msg._))
                throw new Error(`invalid message id: ${ msg._ }`);

            if (this._options.server) {
                if (is.not.ip(msg.i)) {
                    msg.i = undefined;
                    throw new Error(`invalid ip: ${ msg.i }`);
                }

                if (is.not.number(msg.p) || msg.p <= 0) {
                    msg.p = undefined;
                    throw new Error(`invalid port: ${ msg.p }`);
                }
            }
        } catch (e) {
            msg.e = e.message;
        }
        return msg;
    }

    /**
     * @description processes received message
     * @param {String} p received message
     * @param {Function} handler processor function
     * @private
     * @memberof NanopolyZeroMQ
     */
    async _onMessage(p, handler) {
        const m = this._parseMessage(p);
        const recipient = { p: m.p, i: m.i };
        if (is.existy(m.i)) delete m.i;
        if (is.existy(m.p)) delete m.p;
        if (m.e) {
            this._logger.error(p, m.e);
            if (this._options.server) await this.send(recipient, m);
        } else {
            handler(m).then(async r => {
                if (this._options.server) {
                    m.d = r;
                    await this.send(recipient, m);
                }
            }).catch(async e => {
                if (this._options.server) {
                    m.e = e.message;
                    await this.send(recipient, m);
                }
            });
        }
    }

    /**
     * @description gets required sockets ready and connects
     * @param {Function} handler processor function
     * @memberof NanopolyZeroMQ
     */
    async start(handler) {
        if (is.not.function(handler) || handler.constructor.name !== 'AsyncFunction')
            throw new Error('handler must be an async function');
        this._push = {};
        this._pull = new Socket('pull');
        this._pull.handle('error', e => this.logger.error(e));
        this._pull.handle(p => this._onMessage(p.toString(), handler));
        this._options.port = await this._registry.findPort(this._options.port, true);
        this._pull.connect(this._options.port, '0.0.0.0', 'connect');
    }

    /**
     * @description send a new message
     * @param {Object} recipient bundled port and ip
     * @param {Object} msg message
     * @memberof NanopolyZeroMQ
     */
    async send(recipient, msg) {
        if (!msg._) msg._ = shortid.generate();
        if (is.not.object(recipient)) throw new Error('invalid recipient');
        else if (!recipient.i || !recipient.p) throw new Error(`invalid ip(${ recipient.i })/port(${ recipient.p })`);
        else if (is.not.object(msg)) throw new Error('invalid message');

        const address = `${ recipient.i }:${ recipient.p }`;
        if (!this._push[address]) {
            this._push[address] = new Socket('push');
            this._push[address].handle('error', e => this.logger.error(e));
            await this._push[address].connect(recipient.p, recipient.i, 'bindSync');
        }
        if (this._options.server) this._push[address].send({ _: msg._, d: msg.d });
        else this._push[address].send(msg);
    }

    /**
     * @description stops sockets
     * @memberof NanopolyZeroMQ
     */
    async stop() {
        if (this._pull instanceof Socket) this._pull.disconnect();
        for (let address in this._push)
            if (this._push[address] instanceof Socket) {
                this._push[address].disconnect();
                try {
                    const port = parseInt(this._push[address]._address.split(':').pop());
                    if (is.number(port)) await this._registry.releasePort(port);
                } catch (e) {
                    this._logger.error(this._push[address]._address, e);
                }
            }
    }
}

module.exports = NanopolyZeroMQ;
