var NeDB = require("nedb"),
    dgram = require("dgram"),
    os = require("os");

var defaultMulticast = "228.0.0.5",
    defaultMulticastPort = 45564,
    defaultReplMessagePortRange = [4000, 4100],
    defaultMultiCastTTL = 2,
    ifaces = os.networkInterfaces(),
    defaultUseSessionTTL = false,
    defaultSessionTTL = 5000,
    defaultIface = ifaces["eth0"] || ifaces["em0"] || ifaces["en0"],
    oneDay = 86400;

module.exports = function(session) {

    var Store = session.Store;

    function ReplicatedStore(options) {

	options = options || {};

	Store.call(this,options);

	if(! options.multicast) {
	    options.multicast = defaultMulticast;
	}

	if(! options.multicastPort) {
	    options.multicastPort = defaultMulticastPort;
	}

	if(! options.replicationPortRange) {
	    options.replicationPortRange = defaultReplMessagePortRange;
	} else if (options.replicationPortRange.hasOwnProperty("length") && options.replicationPortRange.length === 1  ) {
	    options.replicationPortRange.push(options.replicationPortRange[0] + 100);
	} else if (options.replicationPortRange.hasOwnProperty("length") && options.replicationPortRange.length === 0  ) {
	    options.replicationPortRange = defaultReplMessagePortRange;
	}

	if(! options.ipv4 || options.ipv4 === "127.0.0.1" ) {
	    var v4addr = defaultIface.filter(function(iface) {
		return iface.family === "IPv4";
	    });

	    options.ipv4 = v4addr[0].address;
	}

	if(! options.ipv6 || options.ipv4 === "::1") {
	    var v6addr = defaultIface.filter(function(iface) {
		return iface.family === "IPv6";
	    });
	    options.ipv6 = v6addr[0].address;
	}

	if (! options.use) {
	    options.use = "v4";
	}

	if (! options.multicastTTL) {
	    options.multicastTTL = defaultMultiCastTTL;
	}

	if (typeof options.useSessionTTL === "undefined") {
	    options.useSessionTTL = defaultUseSessionTTL;
	}

	if (! options.sessionTTL) {
	    options.sessionTTL = defaultSessionTTL;
	}

	this.sessionDb = NeDB();
	this.hostDb = NeDB();

	this.config = options;

	if(options.use === "v4") {
	    this.server = dgram.createSocket("udp4");

	    this.server.bind(options.multicastPort, options.ipv4, this.socketBindCb.bind(this));

	} else {
	    this.server = dgram.createSocket("udp6");
	}

	this.server.on("message", this.messageRecieved.bind(this));
    }

    ReplicatedStore.prototype.__proto__ = Store.prototype;

    ReplicatedStore.prototype.messageRecieved = function(message, remoteHostInfo) {
	var messageObject;

	try {
	    console.log("Recieved parsed data object...");
	    messageObject = JSON.parse(message.toString());
	    console.log(messageObject, "via", remoteHostInfo);

	} catch(ex) {
	    console.log(ex);
	};

	if (typeof messageObject === "undefined") {
	    return null;
	}

	if (messageObject.status === "new") {
	    if ( messageObject.type === "node") {
		this.newHost(messageObject, remoteHostInfo);
	    } else if (messageObject.type === "session") {
		this.newSession(messageObject, remoteHostInfo);
	    }
	} else if (messageObject.status === "destroy") {
	    if ( messageObject.type === "node") {
		this.destroyHost(messageObject, remoteHostInfo);
	    } else if ( messageObject.type === "session" ){
		this.destroySession(messageObject, remoteHostInfo);
	    }
	}

	return null;
    };

    ReplicatedStore.prototype.newHost = function(messageObject, hostInfo) {

    };

    ReplicatedStore.prototype.newSession = function(messageObject, hostInfo) {
	var message;

	try {
	    message = JSON.parse(messageObject.toString());
	} catch(ex) {
	    return ex;
	}

	if (typeof message === "undefined") {
	    return null;
	}

	this.sessionDB.find({ sid: message.dataset.sid },function(err, docs){
	    if (err) {
		return err;
	    }

	    if (docs.length === 0) {
		return this.sessionDB.insert(message.dataset,function() {});
	    }
	    return null;
	});

	return null;
    };

    ReplicatedStore.prototype.destroyHost = function(messageObject, hostInfo) {
	var message;

	try {
	    message = JSON.parse(messageObject.toString());
	} catch(ex) {
	    return ex;
	}

	if (typeof message === "undefined") {
	    return null;
	}

	this.hostDB.remove({ address: message.host.address },function(err, docs) {});

	return null;
    };

    ReplicatedStore.prototype.destroySession = function(messageObject, hostInfo) {

	var message;

	try {
	    message = JSON.parse(messageObject.toString());
	} catch(ex) {
	    return ex;
	}

	if (typeof message === "undefined") {
	    return null;
	}
	this.sessionDB.remove({ sid: message.sid },function(err, docs) {});


	return null;

    };

    ReplicatedStore.prototype.sendNewSession = function(dataset) {
	var messageObject = {
	    dataset: dataset,
	    status: "new",
	    type: "session"
	};

	this.sendMessage(messageObject);

	return null;
    };

    ReplicatedStore.prototype.sendDestroyedSession = function(sid) {
	var messageObject = {
	    sid: sid,
	    status: "destroy",
	    type: "session"
	};

	this.sendMessage(messageObject);

	return null;
    };

    ReplicatedStore.prototype.sendMessage = function(messageObject) {
	try {
	    var datasetBuf = new Buffer(JSON.stringify(messageObject));
	    this.server.send(datasetBuf, 0, datasetBuf.length, this.server.address().port, this.config.multicast);
	} catch(ex) {
	    return ex;
	};
	return null;
    };

    ReplicatedStore.prototype.socketBindCb = function() {
	this.server.setBroadcast(true);
	this.server.setMulticastTTL(options.multicastTTL);
	this.server.addMembership(this.config.multicast);

	var newNodeBuf = new Buffer(JSON.stringify({
	    status: "new",
	    type: "node",
	    ip: this.server.address().address,
	    port: this.server.address().port
	}));

	this.server.send(newNodeBuf, 0, newNodeBuf.length, this.server.address().port, this.config.multicast);
    };

    ReplicatedStore.prototype.get = function(sid, fn) {
	this.sessionDb.find({ sid: sid }, function(err, docs) {
	    if (err) {
		return fn(err);
	    }
	    if (!docs) {
		return fn();
	    }

	    return fn(null, data[0]);
	});
    };

    ReplicatedStore.prototype.set = function(sid, session, fn) {
	var dataset = {};
	dataset.sid = sid;
	dataset.session = session;

	try {
	    if(this.config.useSessionTTL) {
		var maxAge = sess.cookie.maxAge;
		var ttl = this.config.sessionTTL;

		ttl = ttl || (typeof(maxAge) === "number"
			      ? maxAge / 1000 | 0
			      : oneDay );

		dataset.ttl = ttl;
	    }

	    this.sessionDB.insert(dataset, function(err, result){
		if(err && fn) {
		    fn(err);
		}

		if (fn) {
		    this.sendNewSession(dataset);
		    fn.apply(this, arguments);
		}
	    }.bind(this));

	} catch(ex)  {
	    if (fn) {
		fn (err);
	    }
	}
    };

    ReplicatedStore.prototype.destroy = function(sid, fn) {
	this.sessionDB.remove({sid: sid}, function(err, docs) {
	    this.sendDestroyedSession(sid);

	    if(fn) {
		fn.apply(this, arguments);
	    }
	}.bind(this));
    };


    return ReplicatedStore;
};
