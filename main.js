import app from "./modules/app.js";
import serverline from "serverline";
import fs from "fs";
import https from "https";
import http from "http";
import util from "util";
import nodemailer from "nodemailer";
import JSONTransport from "nodemailer/lib/json-transport/index.js";

const smtpPassword = fs.existsSync("conf/smtp_password.txt") ? fs.readFileSync("conf/smtp_password.txt", { "encoding": "utf-8" }) : false;
if(smtpPassword) {
	var transport = nodemailer.createTransport({
		host: "smtp.ionos.com",
		port: 587,
		//secure: true,
		auth: {
			user: "no-reply@blocksverse.com",
			pass: smtpPassword,
		}
	});
	
	// verify connection configuration
	transport.verify(function (error) {
		if (error) {
		  console.log(error);
		} else {
		  console.log("SMTP backend is ready");
		}
	  });  
}

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
	if (typeof(obj) == "object") {
		obj = util.inspect(obj, {
			"colors": true
		});
	} else if (obj === undefined) {
		obj = "undefined";
	}
	_log("[ LOG ] " + obj.toString());
}

console.debug = function(obj, userId) {
	if (typeof(obj) == "object") {
		obj = util.inspect(obj, {
			"colors": true
		});
	} else if (obj === undefined) {
		obj = "undefined";
	}
	if (userId === undefined) {
		_log("[DEBUG] " + obj.toString());
	} else {
		_log("[User " + userId + " | DEBUG] " + obj.toString());
	}
}

console.info = function(obj) {
	_log("[INFO ] " + obj.toString());
}

console.warn = function(obj) {
	_warn("[WARN ] " + obj.toString());
}

console.error = function(obj) {
	_error("[ERROR] " + obj.toString());
}

let useHttps = true;

if (!fs.existsSync("cert")) {
	console.warn("Missing 'cert' directory. Please refer to the 'README.md' for more details on how to setup.");
	console.warn("Launching bwapi in http mode");
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

process.on('SIGTERM', () => {
	console.debug('SIGTERM signal received: closing HTTP server')
	server.close(() => {
		console.debug('HTTP server closed');
		throw "exiting";
	});
});

if ((process.env.NODE_ENV === "production" || true) && smtpPassword) {
	process.on("uncaughtException", (err) => {
		if (err === "exiting") return;
		if (err.stack) console.error(err.stack);
		transport.sendMail({
			from: "\"Production FAIIIL👻\" <no-reply@blocksverse.com>",
			to: "zenith@blocksverse.com",
			subject: "BW2: Production Failed",
			text: err.message + "\n" + err.stack + "\n\nHere is the JSON:\n" + JSON.stringify(err),
		}, (send_err) => {
			if (send_err) console.error(send_err);
			process.exit(1);
		});
	});
}

console.log("The server is ready!");
console.log("Note: If you want the server to be publicly accessible (outside your house), be sure to port-forward port 8080 (there are many tutorials on internet)")
