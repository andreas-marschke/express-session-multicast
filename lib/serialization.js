"use strict";

function MessageSerializer (logging) {
    this.log = logging || console;
}

MessageSerializer.prototype.serialize = function (message) {

    var messageObject;

    try {
	this.log.debug("Serializing Object: ", message.toString());
	messageObject = JSON.parse(message.toString());

    } catch(ex) {
	this.log.trace(ex);
	return false;
    }

    if (typeof messageObject === "undefined") {
	return null;
    }

    return messageObject;
};

MessageSerializer.prototype.deserialize = function (message) {

    var messageObject;

    try {
	this.log.debug("Deserializing data Object...", message);
	messageObject = new Buffer(JSON.stringify(message));

    } catch(ex) {
	this.log.trace(ex);
	return null;
    }

    if (typeof messageObject === "undefined") {
	return null;
    }

    return messageObject;
};

module.exports = MessageSerializer;
