# [TwitchPS](https://github.com/jctrvlr/twitchps)
 [![dependency status](https://david-dm.org/jctrvlr/twitchps.svg)](https://david-dm.org/jctrvlr/twitchps) [![Downloads](https://img.shields.io/npm/dm/twitchps.svg?style=flat)](https://www.npmjs.org/package/twitchps) [![Version](https://img.shields.io/npm/v/twitchps.svg?style=flat)](https://www.npmjs.org/package/twitchps)  [![GitHub issues](https://img.shields.io/github/issues/jctrvlr/twitchPS.svg)](https://github.com/jctrvlr/twitchPS/issues)

Neat little [Node](http://nodejs.org) library which lets you easily interact with the Twitch.tv PubSub service.
> TODO - Detailed documentation

## Installation

#### Node

Install via NPM

~~~ bash
npm i twitchps --save
~~~

## Usage

#### Include the Component
~~~ javascript
const TwitchPS = require('twitchps');

// Initial topics are required
let init_topics = [{topic: 'video-playback.bajheera'}];
//Optional reconnect, debug options (Defaults: reconnect: true, debug: false)
var ps = new TwitchPS({init_topics: init_topics});
~~~
>  For more detailed usage see [example application](https://github.com/jctrvlr/twitchps_example) or check out the [documentation]() (Documentation is not available yet).

## Community
- Follow [@itsjackc_](https://twitter.com/itsjackc_) on Twitter
- Have a question that is not a bug report? - Tweet me [@itsjackc_](https://twitter.com/itsjackc_)
- Found a bug ? [Submit an issue](https://github.com/jctrvlr/twitchps/issues/new).
