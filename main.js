let WebSocket = require('ws'),
  shortid = require('shortid'),
  EventEmitter = require('events');

/**
 * Connection to Twitch Pubsub System
 */
class TwitchPS extends EventEmitter {
  /**
   * Constructor
   * @constructor
   * @param {Object} options - JSON object of required options
   * @param {boolean} [options.reconnect=true] - True to try to reconnect, false to not
   * @param {Object[]} options.init_topics - JSON Object array of initial topic
   * @param {string} options.init_topics[].topic - Topic to listen too
   * @param {string} options.init_topics[].token - Authentication token
   * @param {boolean} [options.debug=false] - Turns debug console output on and off
   * @param {string} [options.url='wss://pubsub-edge.twitch.tv'] - URL of WS to connect too. DEFAULT: Twitch {"wss://pubsub-edge.twitch.tv"}
   */
  constructor(options = {
    reconnect: true,
    init_topics: {},
    debug: false,
    url: 'wss://pubsub-edge.twitch.tv'
  }) {
    super();
    if (Object.prototype.toString.call(options.init_topics) != '[object Array]' || options.init_topics.length == 0) throw new Error('Missing initial topics');
    this._recon = options.reconnect;
    this._debug = options.debug;
    this._url = (options.url) ? options.url : 'wss://pubsub-edge.twitch.tv';

    this._init_topics = options.init_topics;
    this._topics = [];
    this._pending = [];

    this._interval = null;
    this._timeout = null;

    this._tries = 0;
    this._init_nonce = null;

    this._ws = null;

    this._connect();

  }

  /**
   * Initial connection function -- Sets up connection, and websocket listeners
   */
  _connect() {
    this._ws = new WebSocket(this._url);
    const self = this;
    this._ws.on('open', () => {
      self.addTopic(self._init_topics, true);
      self.emit('connected');
    });
    /**
     * MSG TYPES HANDLED:
     *   PONG - response to send type ping
     *   RECONNECT - sent when server restarting - reconnect to server
     *   MESSAGE - sent from server with message data - different topics - See topic handler section for emit details
     *     Types of topics:
     *        channel-bits-events-v1 - Bits - Sent on cheer events
     *        whispers - Whisper - Sent on whisper events
     *        video-playback - Sent on update to stream -
     *            stream-up - Sent when stream starts
     *            stream-down - Sent when stream ends
     *            viewcount - Sent on update to viewer count
     *   RESPONSE - sent from server after receiving listen message -- if error is empty string then it is good -
     *     Types of errors:
     *       ERR_BADMESSAGE
     *       ERR_BADAUTH
     *       ERR_SERVER
     *       ERR_BADTOPIC
     */
    this._ws.on('message', (mess) => {
      try {
        let message = JSON.parse(mess);
        // Emit 'raw' event on every message received 
        self.emit('raw', message);
        self._sendDebug('_connect()', message);

        if (message.type === 'RESPONSE') {
          if (message.nonce === self._init_nonce) {
            self._init_nonce = null;
            if (message.error !== "") {
              self._pending[message.nonce].reject(message.error);
              self._handleError('MESSAGE RESPONSE - Error while listening to initial topics', message.error);
            } else {
              self._pending[message.nonce].resolve();
            }
          } else {
            if (self._pending[message.nonce]) {
              if (message.error !== "") {
                self._pending[message.nonce].reject(message.error);
              } else {
                self._pending[message.nonce].resolve();
              }
            } else {
              self._handleError('MESSAGE RESPONSE', 'Received message with unknown nonce');
            }
          }

        } else if (message.type === 'MESSAGE') {
          if (typeof message.data.message === 'string') message.data.message = JSON.parse(message.data.message);
          let split = message.data.topic.split('.'),
            channel = split[1];
          switch (message.data.topic.substr(0, message.data.topic.indexOf('.'))) {
            case 'channel-bits-events-v1':
            case 'channel-bits-events-v2':
              self._onBits(message);
              break;
            case 'channel-bits-badge-unlocks':
              self._onBitsBadgeUnlocks(message);
              break;
            case 'channel-points-channel-v1':
              self._onChannelPoints(message);
              break;
            case 'channel-subscribe-events-v1':
              self._onSub(message);
              break;
            case 'whispers':
              self._onWhisper(message);
              break;
            case 'video-playback':
              self._onVideoPlayback(message, channel);
              break;
            case 'chat_moderator_actions':
              self._onModeratorAction(message);
              break;
          }
        } else if (message.type === 'RECONNECT') {
          self._reconnect();
        } else if (message.type === 'PONG') {
          self._sendDebug('In messageType Pong', 'Received pong');
          clearTimeout(self._timeout);
          self._timeout = null;
        } else {
          self._handleError('MESSAGE RESPONSE - Unknown message type', message);
        }
      } catch (e) {
        self._handleError('Error caught in _connect() on message', e);
      }
    });

    this._ws.on('close', () => {
      self._sendDebug('In websocket close', '');
      self.emit('disconnected');
      if (self._recon) {
        self.emit('reconnect');
        setTimeout(() => {
          self._ws = new WebSocket(self._url);
        }, 1000 * self._tries);
        self._tries += 1;
      }
      clearTimeout(self._timeout);
      clearInterval(self._interval);
      self._timeout = null;
      self._interval = null;
    });

    self._interval = setInterval(() => {
      if (self._ws.readyState === 1) {
        self._ws.send(JSON.stringify({
          type: 'PING'
        }));
        self._sendDebug('In setInterval', 'Sent ping');
        self._timeout = setTimeout(() => self._reconnect(), 15000);
      }
    }, 300000);
  }

  /**
   * Reconnect function - Terminates current websocket connection and reconnects
   */
  _reconnect() {
    const self = this;
    self._ws.terminate();
    self._sendDebug('_reconnect()', 'Websocket has been terminated');
    self.emit('reconnect');
    setTimeout(() => {
      self._connect();
    }, 5000);
  }

  /*****
   ****  Message Handler Functions
   ****/

  /**
   * Handles Bits Message
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'channel-bits-events-v1.<CHANNEL_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @emits bits - {event} -
   *         JSON object -
   *                     bits_used - {integer} - Number of bits used
   *                     channel_id - {string} - User ID of the channel on which bits were used
   *                     channel_name - {string} - Name of the channel on which bits were used
   *                     chat_message - {string} - Chat message sent with the cheer
   *                     context - {string} - Event type associated with this use of bits
   *                     message_id - {string} - Message ID
   *                     message_type - {string} - Message type
   *                     time - {string} - Time when the bits were used. RFC 3339 format
   *                     total_bits_used - {integer} - All-time total number of bits used on this channel by the specified user
   *                     user_id - {string} - User ID of the person who used the bits
   *                     user_name - {string} - Login name of the person who used the bits
   *                     version - {string} - Message version
   */
  _onBits(message) {
    // TODO ADD VERSION CHECK/EMIT
    this.emit('bits', {
      "badge_entitlement": message.data.message.data.badge_entitlement, // v2 only
      "bits_used": message.data.message.data.bits_used,
      "channel_id": message.data.message.data.channel_id,
      "channel_name": message.data.message.data.channel_name,
      "chat_message": message.data.message.data.chat_message,
      "context": message.data.message.data.context,
      "is_anonymous": message.data.message.data.is_anonymous, // v2 only
      "message_id": message.data.message.message_id,
      "message_type": message.data.message.message_type,
      "time": message.data.message.data.time,
      "total_bits_used": message.data.message.data.total_bits_used,
      "user_id": message.data.message.data.user_id,
      "user_name": message.data.message.data.user_name,
      "version": message.data.message.version
    });

  }

  /**
   * Handles Bits Badge Notification Message
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'channel-bits-badge-unlocks.<CHANNEL_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @emits bits-badge - {event} -
   *         JSON object -
   *                     user_id - {string} - ID of user who earned the new Bits badge
   *                     user_name - {string} - Login of user who earned the new Bits badge
   *                     channel_id - {string} - ID of channel where user earned the new Bits badge
   *                     channel_name - {string} - Login of channel where user earned the new Bits badge
   *                     badge_tier - {int} - Value of Bits badge tier that was earned (1000, 10000, etc.)
   *                     chat_message - {string} - [Optional] Custom message included with share
   *                     time - {string} - Time when the bits were used. RFC 3339 format
   */
  _onBitsBadgeUnlocks(message) {
    this.emit('bits-badge', {
      "user_id": message.data.message.data.user_id,
      "user_name": message.data.message.data.user_name,
      "channel_id": message.data.message.data.channel_id,
      "channel_name": message.data.message.data.channel_name,
      "chat_message": message.data.message.data.chat_message,
      "badge_tier": message.data.message.data.badge_tier,
      "time": message.data.message.data.time
    });
  }

  /**
   * Handles Channel Points Event Message
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'channel-points-channel-v1.<CHANNEL_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @emits channel-points - {event} -
   *         JSON object -
   *                     timestamp - {string} - Time the pubsub message was sent
   *                     redemption - {object} - Data about the redemption, includes unique id and user that redeemed it
   *                     channel_id - {string} - ID of the channel in which the reward was redeemed.
   *                     redeemed_at - {string} - Timestamp in which a reward was redeemed
   *                     reward - {object} - Data about the reward that was redeemed
   *                     user_input - {string} - [Optional] A string that the user entered if the reward requires input
   *                     status - {string} - reward redemption status, will be FULFULLED if a user skips the reward queue, UNFULFILLED otherwise
   */
  _onChannelPoints(message) {
    this.emit('channel-points', {
      "timestamp": message.data.message.data.timestamp,
      "redemption": message.data.message.data.redemption,
      "channel_id": message.data.message.data.redemption.channel_id,
      "redeemed_at": message.data.message.data.redemption.redeemed_at,
      "reward": message.data.message.data.redemption.reward,
      "user_input": message.data.message.data.redemption.user_input,
      "status": message.data.message.data.redemption.status
    });
  }

  /**
   * Handles Subscription Message
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'channel-subscribe-events-v1.<CHANNEL_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @emits subscribe - {event} -
   *         JSON object -
   *                     user_name - {string} - Username of subscriber
   *                     display_name - {string} - Display name of subscriber
   *                     channel_name - {string} - Name of the channel subscribed too
   *                     user_id - {string} - UserID of subscriber
   *                     channel_id - {string} - Channel ID of channel subscribed too
   *                     time - {string} - Time of subscription event RFC 3339 format
   *                     sub_plan - {string} - Type of sub plan (ie. Prime, 1000, 2000, 3000)
   *                     sub_plan_name - {string} - Name of subscription plan
   *                     months - {integer} - Months subscribed to channel
   *                     cumulative_months - {integer} - Cumulative months subscribed to channel
   *                     context - {string} - Context of sub -- (ie. sub, resub)
   *                     sub_message - {object} - Object containing message
   *                     sub_message.message - {string} - Message sent in chat on resub
   *                     sub_message.emotes - {array} - Array of emotes
   */
  _onSub(message) {
    this.emit('subscribe', {
      "user_name": message.data.message.user_name,
      "benefit_end_month": message.data.message.benefit_end_month,
      "display_name": message.data.message.display_name,
      "channel_name": message.data.message.channel_name,
      "user_id": message.data.message.user_id,
      "channel_id": message.data.message.channel_id,
      "time": message.data.message.time,
      "sub_plan": message.data.message.sub_plan,
      "sub_plan_name": message.data.message.sub_plan_name,
      "months": message.data.message.months, // Depecrecated, but still used by gift subs
      "cumulative_months": message.data.message.cumulative_months,
      "streak_months": message.data.message.streak_months,
      "context": message.data.message.context,
      "sub_message": {
        "message": message.data.message.sub_message.message,
        "emotes": message.data.message.sub_message.emotes
      },
      "recipient_id": message.data.message.recipient_id,
      "recipient_user_name": message.data.message.recipient_user_name,
      "recipient_display_name": message.data.message.recipient_display_name
    });
  }

  /**
   * Handles Whisper Message
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'whispers.<CHANNEL_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @emits whisper_sent, whisper_received - {event} -
   *          JSON object -
   *                     id - {integer} - Message ID
   *                     body - {string} - Body of message sent
   *                     thread_id - {string} - Thread ID
   *                     sender - {JSON} - Object containing message sender's Information
   *                        sender.id - {integer} - User ID of sender
   *                        sender.username - {string} - Username of sender
   *                        sender.display_name - {string} - Display name of sender (Usually only differs in letter case)
   *                        sender.color - {string} - Color hex-code of sender username in chat
   *                        sender.badges - {Array} - Array of sender badges
   *                        sender.emotes - {Array} - Array of emotes usable by sender
   *                     recipient - {JSON} - Object containing message recipient's Information
   *                        recipient.id - {integer} - User ID of recipient
   *                        recipient.username - {string} - Username of recipient
   *                        recipient.display_name - {string} - Display name of recipient(Usually only differs in letter case)
   *                        recipient.color - {string} - Color hex-code of recipient username in chat
   *                        recipient.badges - {Array} - Array of recipient badges
   *                     sent_ts - {integer} - Timestamp of when message was sent
   *                     nonce - {string} - Nonce associated with whisper message
   */
  _onWhisper(message) {
    if (typeof message.data.message.tags === 'string') message.data.message.tags = JSON.parse(message.data.message.tags);
    if (typeof message.data.message.recipient === 'string') message.data.message.recipient = JSON.parse(message.data.message.recipient);
    switch (message.data.message.type) {
      case 'whisper_sent':
        this.emit('whisper_sent', {
          id: message.data.message.data_object.id,
          body: message.data.message.data_object.body,
          thread_id: message.data.message.data_object.thread_id,
          sender: {
            id: message.data.message.data.from_id,
            username: message.data.message.data_object.tags.login,
            display_name: message.data.message.data_object.tags.display_name,
            color: message.data.message.data_object.tags.color,
            badges: message.data.message.data_object.tags.badges,
            emotes: message.data.message.data_object.tags.emotes
          },
          recipient: {
            id: message.data.message.data_object.recipient.id,
            username: message.data.message.data_object.recipient.username,
            display_name: message.data.message.data_object.recipient.display_name,
            color: message.data.message.data_object.recipient.color,
            badges: message.data.message.data_object.recipient.badges
          },
          sent_ts: message.data.message.data_object.sent_ts,
          nonce: message.data.message.data_object.nonce
        });
        break;
      case 'whisper_received':
        this.emit('whisper_received', {
          id: message.data.message.data_object.id,
          body: message.data.message.data_object.body,
          thread_id: message.data.message.data_object.thread_id,
          sender: {
            id: message.data.message.data.from_id,
            username: message.data.message.data_object.tags.login,
            display_name: message.data.message.data_object.tags.display_name,
            color: message.data.message.data_object.tags.color,
            badges: message.data.message.data_object.tags.badges,
            emotes: message.data.message.data_object.tags.emotes
          },
          recipient: {
            id: message.data.message.data_object.recipient.id,
            username: message.data.message.data_object.recipient.username,
            display_name: message.data.message.data_object.recipient.display_name,
            color: message.data.message.data_object.recipient.color,
            badges: message.data.message.data_object.recipient.badges
          },
          sent_ts: message.data.message.data_object.sent_ts,
          nonce: message.data.message.data_object.nonce
        });
        break;
      case 'thread':
        this.emit('thread', {
          thread_id: message.data.message.data_object.thread_id
        });
        break;
    }
  }

  /**
   * Handles Video-Playback Message
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'whispers.<CHANNEL_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @param channel - {string} - Channel name from
   * @emits stream-up, stream-down, viewcount
   *          stream-up -
   *            JSON object -
   *                      time - {integer} - Server time. RFC 3339 format
   *                      channel_name - {string} - Channel name
   *                      play_delay - {string} - Delay of stream
   *          stream-down -
   *            JSON object -
   *                      time - {integer} - Server time. RFC 3339 format
   *                      channel_name - {string} - Channel name
   *          viewcount -
   *            JSON object -
   *                      time - {integer} - Server time. RFC 3339 format
   *                      channel_name - {string} - Channel name
   *                      viewers - {integer} - Number of viewers currently watching
   */
  _onVideoPlayback(message, channel) {
    if (message.data.message.type === 'stream-up') {
      this.emit('stream-up', {
        time: message.data.message.server_time,
        channel_name: channel,
        play_delay: message.data.message.play_delay
      });
    } else if (message.data.message.type === 'stream-down') {
      this.emit('stream-down', {
        time: message.data.message.server_time,
        channel_name: channel
      });
    } else if (message.data.message.type === 'viewcount') {
      this.emit('viewcount', {
        time: message.data.message.server_time,
        channel_name: channel,
        viewers: message.data.message.viewers
      });
    }
  }

  /**
   * Handles Moderator Actions (Ban/Unban/Timeout/Clear)
   * @param message - {object} - Message object received from pubsub-edge
   * @param message.type - {string} - Type of message - Will always be 'MESSAGE' - Handled by _connect()
   * @param message.data - {JSON} - JSON wrapper of topic/message fields
   * @param message.data.topic - {string} - Topic that message pertains too - Will always be 'chat_moderator_actions.<USER_ID><ROOM_ID>' - Handled by _connect()
   * @param message.data.message - {JSON} - Parsed into JSON in _connect() - Originally received as string from Twitch
   * @emits ban, unban, timeout, clear
   *          ban -
   *            JSON object -
   *                      target - {string} - The banee's username
   *                      target_user_id - {string} - The banee's user ID
   *                      created_by - {string} - The banear's username
   *                      created_by_user_id - {string} - The banear's user ID
   *                      reason - {string} - The reason provided by the banear - Null if no reason was given
   *          unban -
   *            JSON object -
   *                      target - {string} - The banee's username
   *                      target_user_id - {string} - The banee's user ID
   *                      created_by - {string} - The banear's username
   *                      created_by_user_id - {string} - The banear's user ID
   *          timeout -
   *            JSON object -
   *                      target - {string} - The timeout-ee's username
   *                      target_user_id - {string} - The timeout-ee's user ID
   *                      created_by - {string} - The timeout-ear's username
   *                      created_by_user_id - {string} - The timeout-ear's user ID
   *                      duration - {string} - The timeout duration in seconds
   *          clear -
   *            JSON object -
   *                      created_by - {string} - The username of who cleared the chat
   *                      created_by_user_id - {string} - The user ID of who cleared the chat
   */
  _onModeratorAction(message) {
    switch (message.data.message.data.moderation_action) {
      case 'ban':
        this.emit('ban', {
          target: message.data.message.data.args[0],
          target_user_id: message.data.message.data.target_user_id,
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          reason: message.data.message.data.args[1] || null,
        });
        break;
      case 'unban':
        this.emit('unban', {
          target: message.data.message.data.args[0],
          target_user_id: message.data.message.data.target_user_id,
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'timeout':
        this.emit('timeout', {
          target: message.data.message.data.args[0],
          target_user_id: message.data.message.data.target_user_id,
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          duration: message.data.message.data.args[1], // in seconds
          reason: message.data.message.data.args[2] || null,
        });
        break;
      case 'unhost':
        this.emit('unhost', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'emoteonly':
        this.emit('emoteonly', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'emoteonlyoff':
        this.emit('emoteonlyoff', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'followers':
        this.emit('followers', {
          length: message.data.message.data.args[0], // in minutes
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'followersoff':
        this.emit('followersoff', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'subscribers':
        this.emit('subscribers', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'subscribersoff':
        this.emit('subscribersoff', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'r9kbeta':
        this.emit('r9kbeta', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'r9kbetaoff':
        this.emit('r9kbetaoff', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'slow':
        this.emit('slow', {
          length: message.data.message.data.args[0], // in seconds
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'slowoff':
        this.emit('slowoff', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'clear':
        this.emit('clear', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
        });
        break;
      case 'automod_rejected': 
        this.emit('automod_rejected', {
          user: message.data.message.data.target_user_login,
          user_id: message.data.message.data.target_user_id,
          message_id: message.data.message.data.msg_id,
          message: message.data.message.data.args[1],
          reason: message.data.message.data.args[2],
        });
        break;
      case 'approved_automod_message': 
        this.emit('approved_automod_message', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          message_id: message.data.message.data.msg_id,
          target_user_login: message.data.message.target_user_login,
          target_user_id: message.data.message.data.target_user_id,
        });
        break;
      case 'denied_automod_message': 
        this.emit('denied_automod_message', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          message_id: message.data.message.data.msg_id,
          target_user_login: message.data.message.data.target_user_login,
          target_user_id: message.data.message.data.target_user_id,
        });
        break;
      case 'add_permitted_term': 
        this.emit('add_permitted_term', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          approved_term: message.data.message.data.args[0],
        });
        break;
      case 'delete_permitted_term': 
        this.emit('delete_permitted_term', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          deleted_term: message.data.message.data.args[0],
        });
        break;
      case 'add_blocked_term': 
        this.emit('add_blocked_term', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          approved_term: message.data.message.data.args[0],
        });
        break;
      case 'delete_blocked_term': 
        this.emit('delete_blocked_term', {
          created_by: message.data.message.data.created_by,
          created_by_user_id: message.data.message.data.created_by_user_id,
          blocked_term: message.data.message.data.args[0],
        });
        break;
      default:
        // Do Nothing
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
  _handleError(origin, error, topic = null) {
    this.emit('error', {
      origin,
      error,
      topic,
    });
  }

  /**
   * Debug
   * @param {string} origin - Name of what callback function error originates from
   * @param {string} mess - Status message to emit
   */
  _sendDebug(origin, mess) {
    if (this._debug) {
      let d = new Date();
      console.log('TwitchPS -- ' + d.toLocaleString() + ' -- in ' + origin + ' -- ', mess);
    }
  }

  /**
   * Wait for websocket
   */
  _wait(callback) {
    setTimeout(() => {
      if (this._ws.readyState === 1) {
        this._sendDebug('_wait()', 'Connected');
        if (callback != null) {
          callback();
        }
        return;
      }
      this._sendDebug('_wait()', 'Waiting for connection');
      this._wait(callback);
    }, 500);
  }
  /***** End Helper Functions *****/

  /*****
   **** External Functions
   ****/

  /**
   * Add new topics to listen too
   * @param {Object} topics - JSON Object array of topic(s)
   * @param {string} topics[].topic - Topic to listen too
   * @param {string} [token=Default Token] topics[].token - Authentication token
   * @param {Boolean} init - Boolean for if first topics to listen
   */
  addTopic(topics, init = false) {
    return new Promise((res, rej) => {
      this._wait(() => {
        for (let i = 0; i < topics.length; i += 1) {
          let top = topics[i].topic;
          let tok = topics[i].token;
          let nonce = shortid.generate();
          if (init) {
            this._init_nonce = nonce;
            init = false;
          }
          this._pending[nonce] = {
            resolve: () => {
              this._topics.push(top);
              this._sendDebug('addTopic()', `Topic added successfully: ${top}`);
              delete this._pending[nonce];
              return res();
            },
            reject: (err) => {
              this._handleError('addTopic()', err, top);
              delete this._pending[nonce];
              return rej(err);
            }
          };
          this._ws.send(JSON.stringify({
            type: 'LISTEN',
            nonce,
            data: {
              topics: [top],
              auth_token: tok
            }
          }));
          setTimeout(() => {
            if (this._pending[nonce]) {
              this._pending[nonce].reject('timeout');
            }
          }, 10000);
        }
      });
    });

  }

  /**
   * Remove topic(s) from list of topics and unlisten
   * @param {Object} topics - JSON object array of topics
   * @param {string} topics.topic - Topic to unlisten
   *
   */
  removeTopic(topics) {
    return new Promise((resolve, reject) => {
      this._wait(() => {
        for (let i = 0; i < topics.length; i += 1) {
          let top = topics[i].topic;
          let nonce = shortid.generate();

          this._pending[nonce] = {
            resolve: () => {
              let removeTopic = () => {
                delete this._topics[nonce];
              };
              topics.map(removeTopic);
              delete this._pending[nonce];
              return resolve();
            },
            reject: (err) => {
              delete this._pending[nonce];
              return reject(err);
            }
          };
          this._ws.send(JSON.stringify({
            type: 'UNLISTEN',
            nonce,
            data: {
              topics: [top]
            }
          }));
        }
      });
    });
  }

  /***** End External Functions *****/

}
module.exports = TwitchPS;