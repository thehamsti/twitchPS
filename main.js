let WebSocket = require('ws'),
    shortid = require('shortid'),
    Promise = require('bluebird'),
    EventEmitter = require ('events');

class TwitchPubsub extends EventEmitter {
  /**
   * Constructor
   * TODO define what options are needed/wanted for input by user
   * @param {Object} options - JSON object of required options
   */
  constructor(options = {}) {
    super();
    // TODO define variables needed and called any required functions (_connect)
  }

  _connect(){
    // TODO write connection logic


    // TODO FINISH WRITING MSG TYPES
    // MSG TYPES - PONG(response to send type ping), RECONNECT(sent when server restarting - reconnect to server), RESPONSE()
  }

  _reconnect(){
    // TODO write reconnection logic
  }

  /**
   * Add new topics to listen too
   * @param {(Object|Object[])} topics - JSON Object array of topic(s)
   * @param {string} topics[].topic - Topic to listen too
   * @param {string} [token=Default Token] topics[].token - Authentication token
   * TODO write addTopic logic -- USE PROMISE HERE
   */
  addTopic(topics){

  }

  /**
   * Remove topic(s) from list of topics and unlisten
   * @param {Object} topics - JSON object array of topics
   * @param {string} topics.topic - Topic to unlisten
   * TODO write removeTopic logic -- USE PROMISE HERE
   */
  removeTopic(topics){

  }

}
module.exports = TwitchPubsub;
