# nanopoly-zeromq (UNDER DEVELOPMENT)

zeromq transport plugin for nanopoly.

The idea behind this plugin is experimental and it will take time to optimize.
Please do not use in production but testing under heavy load is always welcome.

*PS: Using without nanopoly environment might require too much effort.*

## Install

You can install nanopoly-zeromq via npm by following command:

```bash
npm i --save nanopoly-zeromq
```

You can also clone this repository and make use of it yourself.

```bash
git clone https://github.com/nanopoly/nanopoly-zeromq.git
cd nanopoly-zeromq
npm i
npm test
```

Before running tests, please make sure that you have Redis available on localhost.
If you don't know how to do that temporarily, please use following command to run it via docker.

```bash
docker run -p 6379:6379 --name nanopoly_redis redis:4-alpine
```

## Configuration

- **gc          :** number of milliseconds for garbage collector. it's 120000 by default and you can't set a value lower than 30000.
- **iface       :** name of interface for ip address. there is also an environment variable called IFACE.
- **interval    :** number of milliseconds for action loop in background. it's 3000 by default and you can't set a lower value.
- **log         :** options for pino's log level. there is also an environment variable called LOG_LEVEL. it's error by default.
- **ping        :** number of milliseconds for ping request. it's 10000 by default and you can't set a value lower than 3000.
- **port        :** port number to start from.
- **redis       :** options for redis client.

## Methods

- **.start(handler):** initiates pairing connections between client and server instances
- **.send(address, msg):** sends a new message to the push socket at provided address.
msg must have d attribute for data (actual payload).
server instances call send method to respond but their send method are still public.
if you call them yourself for any reason, you need to process those messages in your own handler methods.
nanopoly might ignore them.
- **.stop():** stops open connections for clean shutdown

***If you don't know what you are doing, I wouldn't recommend you to call private methods and change instance variables directly.***

## Examples

```js
const { Client, Server } = require('nanopoly-zeromq');

const client = new Client({ log: 'debug' });
const server = new Server({ log: 'debug' });

server.start(async m => m.d);
client.start(async r => console.log(r));
client.send('127.0.0.1:8000', { d: 1 });

client.stop();
server.stop();
```

## TODO

- Write detailed protocol documentation for future implementations such as nanomsg, pure redis, etc.
