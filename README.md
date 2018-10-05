# [TwitchPS](https://github.com/jctrvlr/twitchps)
 [![dependency status](https://david-dm.org/jctrvlr/twitchps.svg)](https://david-dm.org/jctrvlr/twitchps)
 [![Downloads](https://img.shields.io/npm/dm/twitchps.svg?style=flat)](https://www.npmjs.org/package/twitchps) [![Version](https://img.shields.io/npm/v/twitchps.svg?style=flat)](https://www.npmjs.org/package/twitchps)  [![GitHub issues](https://img.shields.io/github/issues/jctrvlr/twitchPS.svg)](https://github.com/jctrvlr/twitchPS/issues) [![Build Status](https://travis-ci.org/jctrvlr/twitchPS.svg?branch=master)](https://travis-ci.org/jctrvlr/twitchPS)

Neat little [Node](http://nodejs.org) library which lets you easily interact with the Twitch.tv PubSub service.

*CAUTION* Not updated since Twitch changed API. Broken at the moment. Will fix in near future.

 #### Supported Topics

|  Feature | Topic and Example | Required Scope  |  You are notified when …         |  
|---|---|---|---|
| Bits  | ```channel-bits-events-v1.<channel ID> ``` <br><br> Example: ``` channel-bits-events-v1.44322889 ```| Any scope  | Anyone cheers on a specified channel.  |
| Channel Subscriptions  | ```channel-subscribe-events-v1.<channel ID> ``` <br><br> Example: ``` channel-subscribe-events-v1.44322889 ```| ```channel_subscriptions```  | Anyone subscribes (first month) or resubscribes (subsequent months) to a channel.  |   
| Whispers  |  ```whispers.<user ID> ``` <br><br> Example: ``` whispers.44322889 ```  | ```chat_login```  | Anyone whispers the specified user.  |   
| Stream Status  |   ```video-playback.<channel name> ``` <br><br> Example: ``` video-playback.summit1g ``` |  No scope needed |  Status on stream going up, down, and viewer count. **Not officially supported by Twitch**|
| Moderator Action  |   ```chat_moderator_actions.<user_id_of_moderator>.<room_id> ``` <br><br> Example: ``` video-playback.summit1g ``` |  Any scope |  Sends event when moderator you are listening too bans, or unbans chat user. **Not officially supported by Twitch**|

## Installation

#### Node

Install via NPM

~~~ bash
npm i twitchps --save
~~~

## Usage


#### Include the Component
##### Options
| Name  | Type  |  Optional | Default  | Description  |
|---|---|---|---|---|
| init_topics  | JSON object  | False  | **NONE*  |  JSON Object array of initial topics with tokens. See below. |
|  reconnect |  boolean | True  | True  |  Reconnect when disconnected from Pubsub servers.|
| debug  | boolean  | True  | False  |  Turns debug console output on and off. |
~~~ javascript
const TwitchPS = require('twitchps');

// Initial topics are required
let init_topics = [{topic: 'video-playback.bajheera'}, {topic: 'whispers.44322889', token: 'nkuaf7ur3trg7ju37md1y3u5p52s3q'}];
// Optional reconnect, debug options (Defaults: reconnect: true, debug: false)
// var ps = new TwitchPS({init_topics: init_topics});
var ps = new TwitchPS({init_topics: init_topics, reconnect: false, debug: true});

ps.on('stream-up', (data) => {
  console.log(data.time , data.channel_name);
  // Use data here
});
~~~
> Token changed for security reasons. You can generate a token [here](https://twitchapps.com/tmi/).
> <br>In order to find the userID/channelID follow the instructions [here](https://dev.twitch.tv/docs/v5/guides/using-the-twitch-api/#translating-from-user-names-to-user-ids).
> <br>For more detailed usage see [example application](https://github.com/jctrvlr/twitchps_example).

#### Connection Events
|  Event Name    | You are notified when …                      |
|:--------------:|:--------------------------------------------:|
| 'connected'    | A successful connection has been established |
| 'disconnected' | The connection has been terminated           |
| 'reconnect'    | An attempt will be made to reconnect         |

#### Events emitted after subscribing/adding topics

|              Event Name             |                                                                                                                                                                                                                      List of fields                                                                                                                                                                                                                      |
|:-----------------------------------:|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------:|
| 'bits'                              |  bits_used - {integer} <br> channel_id - {string} <br>channel_name - {string}<br>  chat_message - {string}<br> context - {string} <br> message_id - {string} <br>message_type - {string}<br> time - {string}<br>  total_bits_used - {integer} <br>user_id - {string} <br>user_name - {string}<br> version - {string}                                                                                                                                                                                   |
| 'subscribe'                         | user_name - {string} <br>display_name - {string} <br>channel_name - {string}<br> user_id - {string} <br>channel_id- {string}<br> time- {string}<br> sub_plan- {string}<br> sub_plan_name - {string}<br> months - {integer}<br> context - {string}<br> sub_message - {object}<br> sub_message.message - {string}<br> sub_message.emotes - {array}<br>                                                                                                                                                         |
| 'whisper_sent' & 'whisper_received' | id - {integer}<br> body - {string} <br>thread_id - {string}<br> sender - {JSON} <br>  sender.id - {integer} <br>  sender.username - {string}<br>   sender.display_name - {string}<br>   sender.color - {string} <br>  sender.badges - {Array}<br>   sender.emotes - {Array}<br> recipient - {JSON} <br>  recipient.id - {integer}<br>   recipient.username - {string} <br>  recipient.display_name - {string} <br>  recipient.color - {string} <br>  recipient.badges - {Array} <br>sent_ts - {integer}<br> nonce - {string} |
| 'stream-up'                         | time - {integer} <br>channel_name- {string}<br> play_delay - {string}                                                                                                                                                                                                                                                                                                                                                                                            |
| 'stream-down'                       | time - {integer} <br>channel_name- {string}                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 'viewcount'                         | time - {integer}<br> channel_name- {string} <br>viewers - {integer}                                                                                                                                                                                                                                                                                                                                                                                              |

#### Listen to new topics
~~~ javascript
ps.addTopic([{topic: "video-playback.starladder_cs_en"}]);
ps.addTopic([{topic: 'whispers.38290946', token: 'nkuaf7ur3trg7ju37md1y3u5p52s3q'}]);
~~~
> Token changed for security reasons.

#### Un-listen (remove) to existing topics
~~~ javascript
ps.removeTopic([{topic: "video-playback.starladder_cs_en"}]);
~~~
> Token not required.

## Community
- Follow [@itsjackc_](https://twitter.com/itsjackc_) on Twitter
- Have a question that is not a bug report? - Tweet me [@itsjackc_](https://twitter.com/itsjackc_)
- Found a bug ? [Submit an issue](https://github.com/jctrvlr/twitchps/issues/new).
