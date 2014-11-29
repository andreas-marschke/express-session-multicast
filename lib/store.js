var NeDB = require("nedb"),
    dgram = require("dgram"),
    os = require("os"),
    EventEmitter = require("events").EventEmitter,
    util = require("util");

var defaultMulticast = "228.0.0.5",
    defaultMulticastPort = 4000,
    defaultMultiCastTTL = 2,
    ifaces = os.networkInterfaces(),
    defaultUseSessionTTL = false,
    defaultSessionTTL = 5000,
    defaultIface = ifaces["eth0"] || ifaces["em0"] || ifaces["en0"],
    oneDay = 86400;



function ReplicatedStore(options) {

    options = options || {};

    EventEmitter.call(this,options);

    console.log("Checking for set multicast:", options.multicast);

    if(! options.multicast) {
	console.log("Setting default:", defaultMulticast);
	options.multicast = defaultMulticast;
    }

    console.log("Checking set multicastPort", options.multicastPort);
    if(! options.multicastPort) {
	console.log("Setting default:", defaultMulticastPort);
	options.multicastPort = defaultMulticastPort;
    }

    console.log("Checking set v4 address:", options.ipv4);
    if(! options.ipv4 || options.ipv4 === "127.0.0.1" ) {
	var v4addr = defaultIface.filter(function(iface) {
	    return iface.family === "IPv4";
	});
	console.log("Setting default: ", v4addr[0].address);
	options.ipv4 = v4addr[0].address;
    }

    console.log("Checking set v6 address:", options.ipv6);
    if(! options.ipv6 || options.ipv4 === "::1") {

	var v6addr = defaultIface.filter(function(iface) {
	    return iface.family === "IPv6";
	});
	console.log("Setting default: ", v6addr[0].address);
	options.ipv6 = v6addr[0].address;
    }

    console.log("Checking set ip version to set:", options.use);
    if (! options.use) {
	console.log("Setting default: ", "v4");
	options.use = "v4";
    }

    console.log("Checking set multicastTTL:", options.multicastTTL);
    if (! options.multicastTTL) {
	console.log("Setting default:", defaultMultiCastTTL);
	options.multicastTTL = defaultMultiCastTTL;
    }

    console.log("Checking set used Session TTL:", options.useSessionTTL);
    if (typeof options.useSessionTTL === "undefined") {
	console.log("Setting default:", defaultUseSessionTTL);
	options.useSessionTTL = defaultUseSessionTTL;
    }

    console.log("Checking sessionTTL:", options.sessionTTL);
    if (! options.sessionTTL) {
	console.log("Setting default:", defaultSessionTTL);
	options.sessionTTL = defaultSessionTTL;
    }

    this.sessionDb = new NeDB();
    this.hostDb = new NeDB();

    this.config = options;

    if(options.use === "v4") {
	console.log("Creating Socket for v4");
	this.server = dgram.createSocket("udp4");
	console.log("Binding to Socket port",options.multicastPort, options.ipv4);
	this.server.bind(options.multicastPort, options.ipv4, this.socketBindCb.bind(this));
    }

    return this;
}

ReplicatedStore.prototype.__proto__ = EventEmitter.prototype;

ReplicatedStore.prototype.messageRecieved = function(message, remoteHostInfo) {
    var messageObject;

    try {
	console.log("Recieved parsed data object...", message.toString());
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

    this.sessionDb.find({ sid: message.dataset.sid },function(err, docs){
	if (err) {
	    return err;
	}

	if (docs.length === 0) {
	    return this.sessionDb.insert(message.dataset,function() {});
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
    this.sessionDb.remove({ sid: message.sid },function(err, docs) {});


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
    this.emit("connect");
    console.log("Socket bound successfully!");

    this.server.setBroadcast(true);
    this.server.setMulticastTTL(this.config.multicastTTL);
    this.server.addMembership(this.config.multicast);

    this.server.on("message", this.messageRecieved.bind(this));

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
	if (!docs || docs.length === 0) {
	    return fn();
	}

	return fn(null, docs[0]);
    });
};

ReplicatedStore.prototype.createSession = function(req, session) {

    session.cookie = {};
    session.cookie.secure = true;
    req.session = session;

    req.session.touch = function() { };
    req.session.save = function(cb) { cb(); };

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

	    ttl = ttl || (typeof(maxAge) === "number"
			  ? maxAge / 1000 | 0
			  : oneDay );

	    dataset.ttl = ttl;
	}

	this.sessionDb.insert(dataset, function(err, result){
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
	    fn (ex);
	}
    }
};

ReplicatedStore.prototype.destroy = function(sid, fn) {
    this.sessionDb.remove({sid: sid}, function(err, docs) {
	this.sendDestroyedSession(sid);

	if(fn) {
	    fn.apply(this, arguments);
	}
    }.bind(this));
};

module.exports = ReplicatedStore;
