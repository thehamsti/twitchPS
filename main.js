let WebSocket = require('ws'),
    shortid = require('shortid'),
    Promise = require('bluebird'),
    EventEmitter = require ('events'),
    _ = require('lodash');

class TwitchPubsub extends EventEmitter {
  /**
   * Constructor
   * TODO define what options are needed/wanted for input by user
   * @param {Object} options - JSON object of required options
   * @param {boolean} options.reconnect - True to try to reconnect, false to not
   * @param {Object} options.init_topics - JSON Object array of initial topic(s0
   * @param {string} options.init_topics.topic - Topic to listen too
   * @param {string} options.init_topics.token - Authentication token
   * @param {boolean} options.debug - Turns debug logging on and off
   * @param {string} options.url - URL of WS to connect too. DEFAULT: Twitch {"wss://pubsub-edge.twitch.tv"}
   */
  constructor(options = {reconnect: true, init_topics: {}, debug: false, url: 'wss://pubsub-edge.twitch.tv'}) {
    super();
    if(_.isEmpty(options.init_topics)) throw new Error('Missing initial topics');
    this._recon = options.reconnect;
    this._debug = options.debug;
    this._url = options.url;

    this._init_topics = options.init_topics;
    this._topics = {};
    this._pending = {};

    this._interval = null;
    this._timeout = null;

    this._tries = 0;
    this._init_nonce = null;

    this._ws = null;

    this._connect();

    // TODO define variables needed and called any required functions (_connect)
  }

  _connect(){
    this._ws = new WebSocket(this._url);

    this._ws.on('open', function open() {
      this._init_nonce = shortid.generate();
      this.addTopic(this._init_topics, true); // TODO @addTopic IF INIT IS TRUE THEN SET NONCE TO SEND AS _INIT_NONCE
    });

    this._ws.on('message', function inc(message) {
      message = JSON.parse(message);

      if(message.type === 'RESPONSE') {
        if(message.nonce !== this._init_nonce) {
          this._init_nonce = null;
          this._handleError('MESSAGE RESPONSE', message.error);
          this.emit('error', 'Error while listening to initial topics', message.error);
        } else {
          if(this._pending[message.nonce]) {
            if (message.error !== ""){
               this._pending[message.nonce].reject(message.error); // TODO IN ADDTOPICS MAKE RESOLVE CALLBACK add to _topics
            } else {
              this._pending[message.nonce].resolve(); // TODO IN ADDTOPICS MAKE RESOLVE CALLBACK add to _topics
              delete this._pending[message.nonce];
            }
          }
        }

      } else if (message.type === 'MESSAGE') {
        switch(message.data.topic.substr(0, data.topic.indexOf('.'))) {
          case 'channel-bits-events-v1':
            this._onBits(message);
            break;
          case 'whispers':
            this._onWhisper(message);
            break;
          case 'video-playback':
            this._onVideoPlayback(message);
            break;
        }
      } else if (message.type === 'RECONNECT') {
        this._reconnect();
      } else if (message.type === 'PONG') {
        clearTimeout(this._timeout);
        this._timeout = null;
      } else if
    });

    this._ws.on('close', function inc() {
      if(this._recon) {
        this._reconnect();
      }

      // TODO CLEAR INTERVAL/TIMEOUT HERE
    });


    this._interval = setInterval(() => {
      if(this._ws.readystate === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({type: 'PING'}));
        this._timeout = setTimeout(() => this._reconnect(), 15000);
      }
    }, 30000);

    // TODO write connection logic
    // ---- PingInterval/Timeout

    /**
     * MSG TYPES:
     *   PONG - response to send type ping
     *   RECONNECT - sent when server restarting - reconnect to server - TODO HANDLE FAILED CONNECTION ATTEMPTS
     *   RESPONSE - sent from server after receiving listen message -- if error is empty string then it is good - TODO USE PROMISE HERE --
     *     Types of errors: TODO HANDLE RESPONSE ERRORS
     *       ERR_BADMESSAGE
     *       ERR_BADAUTH
     *       ERR_SERVER
     *       ERR_BADTOPIC
     */
  }

  _reconnect(){
    this._ws.terminate();
    if(this._debug) {
      var d = new Date();
      console.log(d.toLocaleString(), ' -- in _reconnect() -- websocket has been terminated');
    }
    setTimeout(function () {
      this._connect();
    }, 5000);
    // TODO write reconnection logic
  }



  /**
   * Handles Bits Message
   *
   *
   */
  _onBits(message){

  }

  /**
   * Handles Whisper Message
   *
   *
   */
  _onWhisper(message){

  }

  /**
   * Handles Video-Playback Message
   *
   *
   */
  _onVideoPlayback(message){

  }

  /**
   * Handles error
   * @param {string} origin - Name of what callback function error originates from
   * @param {string} error - Error message to emit
   */
  _handleError(origin, error){
    let err_mess = 'Error found ' , origin , ' - ' , error;
    this.emit('error', err_mess);

  }

  /**
   * Debug
   * @param {string} origin - Name of what callback function error originates from
   * @param {string} mess - Status message to emit
   */
  _debug(origin, mess){
    if(this._debug) {
      var d = new Date();
      console.log(d.toLocaleString(), ' -- in ', origin, ' -- ', mess);
    }
  }


  /**
   * Add new topics to listen too
   * @param {Object} topics - JSON Object array of topic(s)
   * @param {string} topics[].topic - Topic to listen too
   * @param {string} [token=Default Token] topics[].token - Authentication token
   * @param {Boolean} init - Boolean for if first topics to listen
   * TODO write addTopic logic -- USE PROMISE HERE
   */
  addTopic(topics, init = false){

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
