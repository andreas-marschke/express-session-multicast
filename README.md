# express-session-multicast

> Multicast Session Replication for webclusters

This session module allows the user to share sessions across multiple servers by
using udp multicast messages sent from the first server at which the session has
been created and stored at runtime inside an instance of NeDB.

## Configuration:

```javascript
	var express = require("express");
	var session = require("express-session");
	var SessionMulticast = require("express-session-multicast");

	var app = express();
	var sess = session({
		secret: "test",
		resave: false,
		saveUninitialized: false,
		store: new SessionMulticast({
		    // multicast address to listen for at runtime
			multicast: "228.0.0.5",
			// port to recieve multicasts on
			multicastPort: 4000,
			// ip to report on start (NEVER set this to 127.0.0.1)
			ipv4: "10.1.0.81",
			// use IPv4 instead of v6
			use: "v4",
			// to set or not to set session time-to-live value (expiry)
			useSessionTTL: true,
			// expiry time for sessions
			sessionTTL: 1000,
			// multicast packet ttl (ie. 3 hops means 3 routers may be between this and the next server
			multicastTTL: 1
		})
	});
```

