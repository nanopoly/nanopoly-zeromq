'use strict';

const IORedis = require('ioredis');
const ip = require('ip');
const is = require('is_js');
const pino = require('pino');
const shortid = require('shortid');

const minGC = 5000;
const minInterval = 1000;

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
        this._ip = ip.address(this._options.iface);
        this._gc = Date.now();
        this._ping = Date.now();
        this._logger = pino({ level: this._options.log || process.env.LOG_LEVEL });
        this._interval = setInterval(() => this._garbageCollector(),
            is.number(this._options.interval) && this._options.interval > minInterval ? this._options.interval : minInterval);

        this._pair = {};
        this._pull = {};
        this._push = {};
        this._publisher = new IORedis(this._options.redis);
        this._subscriber = new IORedis(this._options.redis);
    }

    async send(address, msg) {
        msg._ = this._id;
        if (is.not.string(msg.id) || !shortid.isValid(msg.id)) msg.id = shortid.generate();
        if (!this._push[address]) throw new Error(`invalid address ${ address }`);
        else if (is.not.object(msg)) throw new Error('invalid message');

        this._push[address].send(msg);
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
        const now = Date.now();
        const gc = is.number(this._options.gc) && this._options.gc > minGC ? this._options.gc : minGC;
        if (now - this._gc >= gc) {
            this._gc = now;
            for (let id in this._pair) {
                const pull = this._pull[this._pair[id][1]];
                const push = this._push[this._pair[id][0]];
                if (push && pull) {
                    if (now - this._pair[id][2] > gc) {
                        const push = this._pair[id][0];
                        const pull = this._pair[id][1];
                        this._pull[pull].disconnect();
                        this._push[push].disconnect();
                        setTimeout(() => {
                            delete this._pull[pull];
                            delete this._push[push];
                            delete this._pair[id];
                        }, 3000);
                    }
                }
            }
        } else {
            const ping = is.number(this._options.ping) && this._options.ping > minInterval ? this._options.ping : minInterval;
            if (now - this._ping >= ping) {
                this._ping = now;
                this._publisher.publish(`${ this.constructor.name.toLowerCase() }-ping`, JSON.stringify({ id: this._id }));
            }
        }
    }
}

module.exports = Base;
