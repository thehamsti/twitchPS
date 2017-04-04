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
  }

  _connect(){
    this._ws = new WebSocket(this._url);

    this._ws.on('open', function open() {
      this.addTopic(this._init_topics, true);
    });

    this._ws.on('message', function inc(message) {
      let message = JSON.parse(message);

      if(message.type === 'RESPONSE') {
        if(message.nonce === this._init_nonce) {
          this._init_nonce = null;
          if (message.error !== "") {
            this._handleError('MESSAGE RESPONSE - Error while listening to initial topics', message.error);
          }
        } else {
          if(this._pending[message.nonce]) {
            if (message.error !== ""){
               this._pending[message.nonce].reject(message.error);
            } else {
              this._pending[message.nonce].resolve();
            }
          } else {
            this._handleError('MESSAGE RESPONSE', 'Received message with unknown nonce');
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
      } else {
        this._handleError('MESSAGE RESPONSE - Unknown message type', message);
      }
    });

    this._ws.on('close', function inc() {
      if(this._recon) {
        setTimeout(() => {
          this._ws = new WebSocket(this._url);
        }, 1000 * this._tries);
        this._tries += 1;
      }
      clearTimeout(this._timeout);
      clearInterval(this._interval);
      this._timeout = null;
      this._interval = null;

      this.emit('close', this._recon);

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
    this._debug('_reconnect()', 'Websocket has been terminated');
    setTimeout(function () {
      this._connect();
    }, 5000);
  }

  /*****
   ****  Message Handler Functions
   ****/

  /**
   * Handles Bits Message
   * TODO WRITE COMMENT HEADER/DOCUMENTATION
   *
   */
  _onBits(message){
    // TODO ADD VERSION CHECK/EMIT
    this.emit('bits', {
      "badge_entitlement" : message.data.message.badge_entitlement,
      "bits_used" : message.data.message.bits_used,
      "channel_id" : message.data.message.channel_id,
      "channel_name" : message.data.message.channel_name,
      "chat_message" : message.data.message.chat_message,
      "context" : message.data.message.context,
      "message_id" : message.data.message.message_id,
      "message_type" : message.data.message.message_type,
      "time" : message.data.message.time,
      "total_bits_used" : message.data.message.total_bits_used,
      "user_id" : message.data.message.user_id,
      "user_name" : message.data.message.user_name,
      "version" : message.data.message.version
    });

  }

  /**
   * Handles Whisper Message
   * TODO WRITE COMMENT HEADER/DOCUMENTATION
   *
   */
  _onWhisper(message){

    this.emit('whisper', {
      id: message.data.message.data.id,
      content: message.data.message.body,
      thread: message.data.message.thread_id,
      sender: {
        id: message.data.message.from_id,
        username: message.data.message.tags.login,
        display_name: message.data.message.tags.display_name,
        color: message.data.message.tags.color,
        badges: message.data.message.tags.badges,
        emotes: message.data.message.tags.emotes
      },
      recipient: message.data.message.recipient,
      send_ts: message.data.message.send_ts,
      nonce: message.data.message.nonce
    });

  }

  /**
   * Handles Video-Playback Message
   * TODO WRITE COMMENT HEADER/DOCUMENTATION
   *
   */
  _onVideoPlayback(message){
    if(message.data.message.type === 'stream-up') {
      // TODO WRITE COMMENT describing what is emitted.
      this.emit('stream-up', {
        time: message.data.message.server_time,
        channel_name: message.data.message.channel_name,
        play_delay: message.data.message.play_delay
      });
    } else if (message.data.message.type === 'stream-down') {
      // TODO WRITE COMMENT describing what is emitted.
      this.emit('stream-down', {
        time: message.data.message.server_time,
        channel_name: message.data.message.channel_name
      });
    } else if (message.data.message.type === 'viewcount') {
      // TODO WRITE COMMENT describing what is emitted.
      this.emit('viewcount', {
        time: message.data.message.server_time,
        channel_name: message.data.message.channel_name,
        viewers: message.data.message.viewers
      });
    }
  }

  /***** End Message Handler Functions *****/

  /*****
   ****  Helper Functions
   ****/

  /**
   * Handles error
   * @param {string} origin - Name of what callback function error originates from
   * @param {string} error - Error message to emit
   */
  _handleError(origin, error){
    let err_mess = 'Error found - ' , origin , ' - ' , error;
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
      this.emit('debug', d.toLocaleString(), ' -- in ', origin, ' -- ', mess)
    }
  }

  /***** End Helper Functions *****/

  /*****
   **** External Functions
   ****/

  /**
   * Add new topics to listen too
   * 
   * @param {Object} topics - JSON Object array of topic(s)
   * @param {string} topics[].topic - Topic to listen too
   * @param {string} [token=Default Token] topics[].token - Authentication token
   * @param {Boolean} init - Boolean for if first topics to listen
   */
  addTopic(topics, init = false){
    return new Promise((resolve, reject) => {

      for(topic in topics) {
        let top = topic.topic;
        let tok = topic.token;
        let nonce = shortid.generate();
        if (init) {
          this._init_nonce = nonce;
          init = false;
        }
        this._pending[nonce] = {
          resolve: () => {
            this._topics.push(topic);
             _.pull(this._pending, nonce);
            resolve();
          },
          reject: (err) => {
            reject(err);
            _.pull(this._pending, nonce);
          }
        };
        this._ws.send(JSON.stringify({
          type: 'LISTEN',
          nonce,
          data: {
            topics: top,
            auth_token: tok
          }
        }));
        this.setTimeout(() => {
          if(this._pending[nonce]) {
            this._pending[nonce].reject('timeout');
          }
        }, 10000);
      }

    });

  }

  /**
   * Remove topic(s) from list of topics and unlisten
   * @param {Object} topics - JSON object array of topics
   * @param {string} topics.topic - Topic to unlisten
   * TODO write removeTopic logic -- USE PROMISE HERE
   */
  removeTopic(topics){
    return new Promise((resolve, reject) => {

      let nonce = shortid.generate();

      this._pending[nonce] = {
        resolve: () => {
          let removeTopic = (t) => {
            _.pull(this._topics, t);
          };
          topics.map(removeTopic);
          _.pull(this._pending, nonce);
          resolve();
        },
        reject: (err) => {
          reject(err);
          _.pull(this._pending, nonce);
        }
      };
      this._ws.send(JSON.stringify({
        type: 'UNLISTEN',
        nonce,
        data: {
          topics: [topics]
        }
      }));
    });
  }

  /***** End External Functions *****/


}
module.exports = TwitchPubsub;
