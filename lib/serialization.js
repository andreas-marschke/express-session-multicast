"use strict";

/**
 * Simple no-frills JSON to string serializer and deserializer for
 * datagram messages from the network
 *
 * @constructor
 * @memberof express-session-multicast
 *
 * @param {Object} logging - object handling logging
 */
function MessageSerializer(logging) {
  this.log = logging || console;

  if (typeof this.log.debug === "undefined") {
    this.log.debug = this.log.info;
  }
}

/**
 * Parses network message
 *
 * @return {null|Object} POJO if possible or null
 */
MessageSerializer.prototype.serialize = function(message) {

  var messageObject;

  try {
    this.log.debug("Serializing Object: ", message.toString());
    messageObject = JSON.parse(message.toString());

  } catch (ex) {
    this.log.trace(ex);
    return null;
  }

  if (typeof messageObject === "undefined") {
    return null;
  }

  return messageObject;
};

/**
 * Stringifies POJO
 * @return {null|string} stringified POJO or null
 */
MessageSerializer.prototype.deserialize = function(message) {

  var messageObject;

  try {
    this.log.debug("Deserializing data Object...", message);
    messageObject = new Buffer(JSON.stringify(message));

  } catch (ex) {
    this.log.trace(ex);
    return null;
  }

  if (typeof messageObject === "undefined") {
    return null;
  }

  return messageObject;
};

module.exports = MessageSerializer;
