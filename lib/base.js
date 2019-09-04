'use strict';

const ip = require('ip');
const is = require('is_js');
const pino = require('pino');
const redis = require('redis');
const shortid = require('shortid');
const Socket = require('../lib/socket');

const minGC = 30000;
const minInterval = 3000;

class Base {
    /**
     *Creates an instance of Base.
     * @param {Object} options transport options
     * @memberof Base
     */
    constructor(options) {
        this._options = Object.assign({ log: 'error', ping: 10000, gc: 120000, interval: 3000 },
            is.object(options) && is.not.array(options) ? options : {});

        this._id = shortid.generate();
        this._ip = ip.address(this._options.iface || process.env.IFACE);
        this._gc = Date.now();
        this._ping = Date.now();
        this._logger = pino({ level: this._options.log || process.env.LOG_LEVEL });
        this._interval = setInterval(() => this._garbageCollector(),
            is.number(this._options.interval) && this._options.interval > minInterval ? this._options.interval : minInterval);

        this._pair = {};
        this._pull = {};
        this._push = {};
        this._publisher = new redis.createClient(this._options.redis);
        this._subscriber = new redis.createClient(this._options.redis);
    }

    /**
     * @description sends a new message to push socket
     * @param {*} address push socket's address
     * @param {*} msg message
     * @memberof Base
     */
    send(address, msg) {
        msg._ = this._id;
        if (is.not.string(msg.id) || !shortid.isValid(msg.id)) msg.id = shortid.generate();
        if (!this._push[address]) throw new Error(`invalid address ${ address }`);
        else if (is.not.object(msg)) throw new Error('invalid message');

        this._push[address].send(msg);
        this._logger.info(`${ this._id } -> ${ address }`, msg, this._name, this._id);
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
            else if (is.not.string(msg.id) || !shortid.isValid(msg.id))
                throw new Error(`invalid message id: ${ msg.id }`);
            else if (!this._pair[msg._]) throw new Error(`invalid instance id: ${ msg._ }`);
        } catch (e) {
            msg.e = e.message;
        }
        return msg;
    }

    /**
     * @description triggers ping/pong and collects garbage
     * @memberof Base
     */
    _garbageCollector() {
        if (!this._progress && is.not.empty(this._pair)) {
            this._progress = true;
            const now = Date.now();
            const gc = is.number(this._options.gc) && this._options.gc > minGC ? this._options.gc : minGC;
            try {
                if (now - this._gc >= gc) {
                    this._gc = Date.now();
                    this._logger.info('garbage collector started', this._name, this._id);
                    for (let id in this._pair) {
                        const pull = this._pull[this._pair[id][1]];
                        const push = this._push[this._pair[id][0]];
                        if (push && pull) {
                            if (now - this._pair[id][2] > gc) {
                                const push = this._pair[id][0];
                                const pull = this._pair[id][1];
                                this._pull[pull].disconnect();
                                this._push[push].disconnect();
                                delete this._pull[pull];
                                delete this._push[push];
                                delete this._pair[id];
                                this._logger.info(`${ id } unpaired`, this._name, this._id);
                            }
                        }
                    }
                    this._logger.info('garbage collector finished', this._name, this._id);
                } else {
                    const ping = is.number(this._options.ping) && this._options.ping > minInterval ? this._options.ping : minInterval;
                    if (now - this._ping >= ping) {
                        this._ping = Date.now();
                        this._publisher.publish(`${ this._name }-ping`, JSON.stringify({ id: this._id }));
                        this._logger.info('ping', this._name, this._id);
                    }
                }
            } catch (e) {
                this._logger.error(e, this._name, this._id);
            }
            this._progress = false;
        }
    }

    /**
     * @description stops open connections for clean shutdown
     * @memberof Base
     */
    stop() {
        clearInterval(this._interval);
        this._publisher.quit();
        this._subscriber.quit();
        for (let address in this._push) if (this._push[address] instanceof Socket) this._push[address].disconnect();
        for (let address in this._pull) if (this._pull[address] instanceof Socket) this._pull[address].disconnect();
    }
}

module.exports = Base;
