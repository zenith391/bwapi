import app from "./app.js";
import serverline from "serverline";
import fs from "fs";
import https from "https";
import http from "http";
import util from "util";

// Init logging
const logFilePath = "latest.log";
fs.writeFileSync(logFilePath, ""); // be sure log file is empty

// Init CLI interface (allows to manipulate world cache)
serverline.init();
serverline.setPrompt("> ");
serverline.setCompletion(["cache", "exit"]);
serverline.on("line", function(line) {
	if (line == "cache clear") {
		console.log("Clearing world cache..");
		invalidateWorldCache();
		console.log("Done!");
	} else if (line == "cache peek") {
		if (!isWorldCacheValid()) {
			console.log("Cache hasn't been filled yet!");
		} else {
			console.debug("Peeking cache..");
			worldCache(function(err, worlds) {
				console.log("Done: " + util.inspect(worlds, {"colors": true}));
			});
		}
	} else if (line == "cache fill") {
		if (isWorldCacheValid()) {
			console.log("Cache is already filled, clear the cache first!");
		} else {
			console.debug("Filling cache..");
			worldCache(function(err, worlds) {
				console.debug("Done");
			});
		}
	} else if (line == "cache") {
		console.log("Usage: cache [clear|peek|fill]");
	} else {
		console.log("Commands:");
		console.log("- cache [clear|peek|fill]")
	}
});

serverline.on("SIGINT", function(line) {
	process.exit(0);
})

// Customize console.log functions //
function createLogFunction(original) {
	return function(obj) {
		original(obj);
		fs.appendFile(logFilePath, obj.toString() + "\n", function (err) {
			if (err) {
				throw err;
			}
		});
	}
}

let _log = createLogFunction(console.log);
let _warn = createLogFunction(console.warn);
let _error = createLogFunction(console.error);

console.log = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	if (typeof(obj) == "object") {
		obj = util.inspect(obj, {
			"colors": true
		});
	} else if (obj === undefined) {
		obj = "undefined";
	}
	_log("[ " + dateStr + " | LOG   ] " + obj.toString());
}

console.debug = function(obj, userId) {
	let dateStr = new Date().toLocaleTimeString();
	if (typeof(obj) == "object") {
		obj = util.inspect(obj, {
			"colors": true
		});
	} else if (obj === undefined) {
		obj = "undefined";
	}
	if (userId === undefined) {
		_log("[ " + dateStr + " | DEBUG ] " + obj.toString());
	} else {
		_log("[ " + dateStr + " | User " + userId + " | DEBUG ] " + obj.toString());
	}
}

console.info = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_log("[ " + dateStr + " | INFO  ] " + obj.toString());
}

console.warn = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_warn("[ " + dateStr + " | WARN  ] " + obj.toString());
}

console.error = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_error("[ " + dateStr + " | ERROR ] " + obj.toString());
}

let useHttps = true;

if (!fs.existsSync("cert")) {
	console.error("Missing 'cert' directory. Please refer to the 'README.md' for more details on how to setup.");
	console.error("Launching bwapi in http mode");
	useHttps = false;
}

let options = {};
if (useHttps) {
	options = {
		key: fs.readFileSync("cert/privkey.pem"),
		cert: fs.readFileSync("cert/fullchain.pem")
	};
}

const port = 8080;

let server = useHttps ? https.createServer(options, app) : http.createServer(options, app);
server.listen(port);

console.log("The server is ready!");
console.log("Note: If you want the server to be publicly accessible (outside your house), be sure to port-forward port 8080 (there are many tutorials on internet)")