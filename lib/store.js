"use strict";

/* eslint-disable no-proto*/

var NeDB = require("nedb"),
    dgram = require("dgram"),
    os = require("os"),
    Serializer = require("./serialization");

var defaultMulticastv4 = "228.0.0.5",
    defaultMulticastv6 = "ffbe::043",
    defaultMulticastPort = 4000,
    defaultMultiCastTTL = 2,
    ifaces = os.networkInterfaces(),
    defaultUseSessionTTL = false,
    defaultSessionTTL = 5000,
    defaultIface = ifaces.eth0 || ifaces.em0 || ifaces.en0,
    defaultGracefullShutdown = true,
    oneDay = 86400;

module.exports = function(connect) {

    var StoreCtor = connect.Store || connect.session.Store;

    console.log(StoreCtor);

    function ReplicatedStore(options) {
	options = options || {};

	StoreCtor.call(this, options);

	if (options.logger) {
	    this.log = options.logger;
	} else {
	    this.log = console;
	}


	this.sessionDb = new NeDB();
	this.hostDb = new NeDB();

	this.config = this.sanitizeOptions(options);

	if(this.config.use === "v4") {
	    this.log.debug("Creating Socket for v4");

	    this.server = dgram.createSocket("udp4");
	    this.server.on("listening", function() {
		this.server.setBroadcast(true);
		this.server.setMulticastTTL(this.config.multicastTTL);
		this.log.debug("Adding to broadcast membership:", this.config.multicast);
		this.server.addMembership(this.config.multicast);
		this.log.debug("Socket bound successfully!");

		this.log.info("Listening Socket Activated!");
		try {

		    var messageObject = {
			status: "new",
			type: "node",
			address: this.config.ipv4,
			port: this.server.address().port
		    };

		    this.log.info("Introducing Server to Network:",
				  "on port:", this.config.multicastPort,
				  "to multicast address:", this.config.multicast);

		    var message = this.serializer.deserialize(messageObject);

		    this.server.send(message, 0, message.length, this.config.multicastPort, this.config.multicast);
		} catch (ex) {
		    this.log.trace(ex);
		    return ex;
		}

		if (this.config.gracefullShutdown) {
		    process.on("SIGINT", this.handleNodeDestruction.bind(this));
		}
		return this.emit("connect");

	    }.bind(this));
	    this.log.debug("Binding to Socket port", this.config.multicastPort, this.config.ipv4);
	    this.server.bind(this.config.multicastPort);
	} else if (this.config.use === "v6") {
	    this.log.debug("Creating Socket for v6");

	    this.server = dgram.createSocket("udp6");
	    this.server.on("listening", function() {
		this.server.setBroadcast(true);
		this.server.setMulticastTTL(this.config.multicastTTL);
		this.log.debug("Adding to broadcast membership:", this.config.multicast);
		this.server.addMembership(this.config.multicast);
		this.log.debug("Socket bound successfully!");

		this.log.info("Listening Socket Activated!");
		try {

		    var messageObject = {
			status: "new",
			type: "node",
			address: this.config.ipv6,
			port: this.server.address().port
		    };

		    this.log.info("Introducing Server to Network:",
				  "on port:", this.config.multicastPort,
				  "to multicast address:", this.config.multicast);

		    var message = this.serializer.deserialize(messageObject);

		    this.server.send(message, 0, message.length, this.config.multicastPort, this.config.multicast);
		} catch (ex) {
		    this.log.trace(ex);
		    return ex;
		}

		if (this.config.gracefullShutdown) {
		    process.on("SIGINT", this.handleNodeDestruction.bind(this));
		}
		return this.emit("connect");
	    }.bind(this));

	    this.log.debug("Binding to Socket port", this.config.multicastPort, this.config.ipv6);
	    this.server.bind(this.config.multicastPort);
	}

	this.server.on("message", this.messageRecieved.bind(this));

	return this;
    }

    ReplicatedStore.prototype.__proto__ = StoreCtor.prototype;

    ReplicatedStore.prototype.handleNodeDestruction = function() {
	this.log.info("Got message to shutdown gracefully...");

	var messageObject = {
	    status: "destroy",
	    type: "node"
	};

	var message = this.serializer.deserialize(messageObject);

	this.server.send(message, 0, message.length, this.config.multicastPort, this.config.multicast, function() {
	    this.emit("disconnect");
	    this.log.info("Sent self-destruction signal to cluster, dying...");
	    process.exit(0);
	}.bind(this));
    };

    ReplicatedStore.prototype.messageRecieved = function(message, rinfo) {
	var messageObject = this.serializer.serialize(message);

	this.log.debug("Serialized Message recieved from:", messageObject);

	if (messageObject.status === "new") {
	    if ( messageObject.type === "node") {
		this.newHost(messageObject, rinfo);
	    } else if (messageObject.type === "session") {
		this.newSession(messageObject, rinfo);
	    } else if (messageObject.type === "greeting") {
		this.handleHostGreeting(messageObject, rinfo);
	    } else if (messageObject.type === "question") {
		if (messageObject.question === "existingSessions") {
		    this.handleQuestionExistingSessions(messageObject, rinfo);
		}
	    }
	} else if (messageObject.status === "answer") {
	    if (messageObject.type === "question") {
		if (messageObject.question === "existingSessions") {
		    this.handleAnswerExistingSessions(messageObject, rinfo);
		}
	    }

	} else if (messageObject.status === "destroy") {
	    if ( messageObject.type === "node") {
		this.destroyHost(messageObject, rinfo);
	    } else if ( messageObject.type === "session" ){
		this.destroySession(messageObject, rinfo);
	    }
	}

	return null;
    };

    ReplicatedStore.prototype.newHost = function(messageObject) {
	this.hostDb.find({ address: messageObject.address, port: messageObject.port }, function(err, docs) {
	    if (err) {
		return this.log.trace(err);
	    }

	    if (docs.length === 0 && this.config.ipv4 !== messageObject.address) {
		this.log.info("New Host at:", messageObject.address, "port:", messageObject.port);
		this.hostDb.insert(messageObject);
		this.sendGreeting(messageObject.address, messageObject.port);
	    }
	    return null;
	}.bind(this));
    };

    ReplicatedStore.prototype.sendGreeting = function(address, port) {
	var messageObject = {
	    status: "new",
	    type: "greeting",
	    address: this.config.ipv4,
	    port: this.config.multicastPort
	};

	this.log.info("Sending greeting to new Host:", address, "at port:", port);

	var message = this.serializer.deserialize(messageObject);

	try {
	    this.server.send(message, 0, message.length, port, address);
	} catch(ex) {
	    this.log.trace(ex);
	    return ex;
	}
	return null;
    };

    ReplicatedStore.prototype.newSession = function(messageObject, hostInfo) {
	if (!messageObject) {
	    return null;
	}

	this.log.info("Got new session:", messageObject, "from:", hostInfo.address, "at port:", hostInfo.port);

	this.sessionDb.find({ sid: messageObject.dataset.sid }, function(err, docs){
	    if (err) {
		return err;
	    }

	    if (docs.length === 0) {
		return this.sessionDb.insert(messageObject.dataset, function() {});
	    }
	    return null;
	}.bind(this));

	return null;
    };

    ReplicatedStore.prototype.handleHostGreeting = function(messageObject, remoteHostInfo) {

	this.log.info("Adding Host:", remoteHostInfo.address, "at port:", remoteHostInfo.port, "to Host Collection");
	this.hostDb.insert({ address: remoteHostInfo.address, port: remoteHostInfo.port });
	this.hostDb.find({ asked: true }, function(err, docs) {
	    if (err) {
		this.log.trace(err);
		return err;
	    }

	    if (docs.length === 0) {
		var messageQuestionObject = {
		    status: "new",
		    type: "question",
		    question: "existingSessions"
		};

		var message = this.serializer.deserialize(messageQuestionObject);

		this.server.send(message, 0, message.length, remoteHostInfo.port, remoteHostInfo.address);
		this.hostDb.insert({ asked: true, host: remoteHostInfo.address, hostPort: remoteHostInfo.port });
	    }

	    return null;
	}.bind(this));
    };

    ReplicatedStore.prototype.handleQuestionExistingSessions = function(messageObject, remoteHostInfo) {
	this.log.info("Recieved question for existing sessions from:", remoteHostInfo.address, "at port:", remoteHostInfo.port);

	this.sessionDb.find({}, function(err, docs){
	    if(err) {
		this.log.trace(err);
		return err;
	    }

	    var messageQuestionObject = {
		type: "question",
		status: "answer",
		question: "existingSessions",
		sessions: docs,
		from: this.config.ipv4,
		fromPort: this.config.port
	    };

	    var message = this.serializer.deserialize(messageQuestionObject);
	    this.server.send(message, 0, message.length, remoteHostInfo.port, remoteHostInfo.address);

	    return null;
	}.bind(this));
    };

    ReplicatedStore.prototype.handleAnswerExistingSessions = function(messageObject, remoteHostInfo) {
	this.log.info("Recieved answer to the question for existing sessions from:", remoteHostInfo.address, "at port:", remoteHostInfo.port);

	messageObject.sessions.forEach(function(session){
	    this.sessionDb.find({ sid: session.sid }, function(err, docs){
		if (err) {
		    this.log.trace(err);
		    return null;
		}

		if (docs.length === 0) {
		    this.log.debug("Could not find a reference to given sid(", session.sid, ") in my Database. Inserting session");
		    this.sessionDb.insert(session);
		}
		return null;
	    }.bind(this));
	}, this);
    };

    ReplicatedStore.prototype.destroyHost = function(messageObject, hostInfo) {
	this.log.info("Got host self-destruct notification from:", hostInfo.address, "at port:", hostInfo.port);

	this.hostDb.remove({ address: hostInfo.address });
	return null;
    };

    ReplicatedStore.prototype.destroySession = function(messageObject, hostInfo) {
	this.log.info("Supposed to destroy a session:", hostInfo.address, "at port:", hostInfo.port);
	this.sessionDb.remove({ sid: messageObject.sid });

	return null;

    };

    ReplicatedStore.prototype.sendNewSession = function(dataset) {
	var messageObject = {
	    dataset: dataset,
	    status: "new",
	    type: "session"
	};

	this.sendMessage(this.serializer.deserialize(messageObject));

	return null;
    };

    ReplicatedStore.prototype.sendDestroyedSession = function(sid) {
	var messageObject = {
	    sid: sid,
	    status: "destroy",
	    type: "session"
	};

	this.sendMessage(this.serializer.deserialize(messageObject));

	return null;
    };

    ReplicatedStore.prototype.sendMessage = function(message) {
	try {
	    this.server.send(message, 0, message.length, this.server.address().port, this.config.multicast);
	} catch(ex) {
	    this.log.trace(ex);
	    return ex;
	}
	return null;
    };

    ReplicatedStore.prototype.get = function(sid, fn) {
	this.sessionDb.find({ sid: sid }, function(err, docs) {
	    if (err) {
		this.log.trace(err);
		return fn(err);
	    }
	    if (!docs || docs.length === 0) {
		this.log.info("get()'ing Session for sid:", sid, "returned 0 length docs");
		return fn();
	    }
	    this.log.debug("Found session for sid:", sid, "with dataset:", docs);
	    return fn(null, docs[0].session);
	}.bind(this));
    };

    ReplicatedStore.prototype.set = function(sid, session, fn) {
	var dataset = {};
	session.save = sid;
	dataset.sid = sid;
	dataset.session = session;

	try {
	    if(this.config.useSessionTTL) {
		var maxAge = session.cookie.maxAge;
		var ttl = this.config.sessionTTL;

		ttl = ttl || (typeof maxAge === "number"
			      ? maxAge / 1000 | 0
			      : oneDay );

		dataset.ttl = ttl;
	    }

	    this.sendNewSession(dataset);

	    this.sessionDb.insert(dataset, function(err, result){
		this.log.debug(result, "stored in session database");

		if(err && fn) {
		    fn(err);
		}

		if (fn) {
		    fn.apply(this, arguments);
		}
	    }.bind(this));

	} catch(ex)  {
	    this.log.trace(ex);
	    if (fn) {
		fn(ex);
	    }
	}
    };

    ReplicatedStore.prototype.destroy = function(sid, fn) {
	this.sessionDb.remove({sid: sid}, function(err, docs) {
	    this.log.debug("Removed docs:", docs, "from session database");
	    if (err) {
		this.log.trace(err);
		return err;
	    }

	    this.sendDestroyedSession(sid);

	    if(fn) {
		fn.apply(this, arguments);
	    }
	}.bind(this));
    };

    ReplicatedStore.prototype.sanitizeOptions = function(options) {
	/* polyfilling logging facillities */
	if (typeof this.log.debug === "undefined") {
	    this.log.debug = this.log.info;
	}

	this.serializer = new Serializer(this.log);

	this.log.debug("Checking set ip version to set:", options.use);
	if (!options.use) {
	    this.log.debug("Setting default: ", "v4");
	    options.use = "v4";
	}

	this.log.debug("Checking for set multicast:", options.multicast);
	if(!options.multicast) {
	    if (options.use === "v4") {
		this.log.debug("Setting default:", defaultMulticastv4);
		options.multicast = defaultMulticastv4;
	    } else if (options.use === "v6") {
		this.log.debug("Setting default:", defaultMulticastv6);
		options.multicast = defaultMulticastv6;
	    }
	}

	this.log.debug("Checking set multicastPort", options.multicastPort);
	if(!options.multicastPort) {
	    this.log.debug("Setting default:", defaultMulticastPort);
	    options.multicastPort = defaultMulticastPort;
	}

	this.log.debug("Checking set v4 address:", options.ipv4);
	if(!options.ipv4 || options.ipv4 === "127.0.0.1") {
	    var v4addr = defaultIface.filter(function(iface) {
		return iface.family === "IPv4";
	    });
	    this.log.debug("Setting default: ", v4addr[0].address);
	    options.ipv4 = v4addr[0].address;
	}

	this.log.debug("Checking set v6 address:", options.ipv6);
	if(!options.ipv6 || options.ipv6 === "::1") {

	    var v6addr = defaultIface.filter(function(iface) {
		return iface.family === "IPv6";
	    });
	    this.log.debug("Setting default:", v6addr[0].address);
	    options.ipv6 = v6addr[0].address;
	}

	this.log.debug("Checking set multicastTTL:", options.multicastTTL);
	if (!options.multicastTTL) {
	    this.log.debug("Setting default:", defaultMultiCastTTL);
	    options.multicastTTL = defaultMultiCastTTL;
	}

	this.log.debug("Checking set used Session TTL:", options.useSessionTTL);
	if (typeof options.useSessionTTL === "undefined") {
	    this.log.debug("Setting default:", defaultUseSessionTTL);
	    options.useSessionTTL = defaultUseSessionTTL;
	}

	this.log.debug("Checking sessionTTL:", options.sessionTTL);
	if (!options.sessionTTL) {
	    this.log.debug("Setting default:", defaultSessionTTL);
	    options.sessionTTL = defaultSessionTTL;
	}

	this.log.debug("Checking gracefullShutdown:", options.gracefullShutdown);
	if (typeof options.gracefullShutdown === "undefined") {
	    this.log.debug("Setting default:", defaultGracefullShutdown);
	    options.gracefullShutdown = defaultGracefullShutdown;
	}
	return options;
    };

    return ReplicatedStore;
};
