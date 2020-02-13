const https = require("https");
const fs = require("fs");
const multiparty = require("multiparty");

HOST = "https://bwsecondary.ddns.net:8080";
ROOT_NAME = __dirname;
EARLY_ACCESS = true; // is this server early access? (used for some status identifiers)

authTokens = {};
capabilities = {}; // for modded

if (!fs.existsSync("cert")) {
	console.error("Missing 'cert' directory. Please refer to the 'README.md' for more details on how to setup.");
	return;
}

const options = {
	key: fs.readFileSync("cert/privkey.key"),
	cert: fs.readFileSync("cert/fullchain.pem")
}

const fileOptions = {
	root: __dirname
}

const express = require("express");
const app = express();
const port = 8080

let _log = console.log
let _warn = console.warn
let _error = console.error

console.log = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_log("[ " + dateStr + " | LOG   ] " + obj.toString());
}

console.debug = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	if (typeof(obj) == "object") {
		_log(obj)
	} else {
		_log("[ " + dateStr + " | DEBUG ] " + obj.toString());
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

getAuthToken = function(req) {
	let authToken = undefined;
	if (req.headers["bw-auth-token"] != undefined) {
		authToken = req.headers["bw-auth-token"];
	}
	return authToken;
}

value2 = function(v) {
	if (typeof(v) == "object") {
		return v[0];
	} else {
		return v;
	}
}

value = function(body, name) {
	let v = body[name];
	if (typeof(v) == "object") {
		return v[0];
	} else {
		return v;
	}
}

validAuthToken = function(req, res, bodyCheck) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(405).json({
			"error": 405,
			"error_msg": "missing authentication token"
		});
		return [false];
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(405).json({
			"error": 405,
			"error_msg": "unauthentificated user"
		});
		return [false];
	}
	if (bodyCheck && (req.body == undefined || req.body == null)) {
		res.status(403).json({
			"error": "no body"
		});
		return [false];
	}
	return [true, userId];
}

datePart = function(num) {
	let str = num.toString();
	if (str.length < 2) {
		str = "0" + str;
	}
	return str;
}

dateString = function(date) {
	if (date == undefined || date == null) {
		date = new Date();
	}
	let currDateStr = 
		date.getUTCFullYear()
		+ '-'
		+ datePart(date.getUTCMonth() + 1)
		+ '-'
		+ datePart(date.getUTCDate()) + 'T'
		+ datePart(date.getUTCHours()) + ':'
		+ datePart(date.getUTCMinutes()) + ':'
		+ datePart(date.getSeconds()) + "+00:00"
	return currDateStr;
}

app.use(require("compression")())

app.use(function(req, res, next) {
	console.debug(req.method + " " + req.url);
	res.set("Server", "BWAPI 1.0 / Express 4 / NodeJS");
	res.set("Access-Control-Allow-Origin", "*"); // it's a public API :/
	next();
});

app.use(function(req, res, next) {
	if (req.headers["content-type"] != undefined) {
		if (req.headers["content-type"].indexOf("multipart/form-data") != -1) {
			let form = new multiparty.Form();
			form.parse(req, function(err, fields, files) {
				req.body = fields;
				req.files = files;
				next();
			});
		} else if (req.headers["content-type"].indexOf("application/x-www-form-urlencoded") != -1) {
			req.files = {};
			express.urlencoded({"extended":false, "limit": "50mb"})(req, res, next)
		} else {
			next();
		}
	} else {
		next();
	}
});

app.use("/images", express.static("images"));

let cores = fs.readdirSync("modules");
for (i in cores) {
	let file = cores[i];
	console.debug("Init module " + file);
	require("./modules/" + file).run(app);
}

// Plain file hosting
let steamRemoteConf = JSON.stringify(JSON.parse(fs.readFileSync("conf/app_remote_configuration.json"))); // minified
app.get("/api/v1/steam-app-remote-configuration", function(req, res) {
	res.status(200).send(steamRemoteConf);
});

let contentCategories = JSON.stringify(JSON.parse(fs.readFileSync("conf/content_categories.json"))); // minified
app.get("/api/v1/content-categories-no-ip", function(req, res) {
	res.status(200).send(contentCategories);
});

let blocksPricings = JSON.stringify(JSON.parse(fs.readFileSync("conf/blocks_pricings.json"))); // minified
app.get("/api/v1/block_items/pricing", function(req, res) {
	res.status(200).send(blocksPricings);
});

app.get("/api/v1/store/coin_packs", function(req, res) {
	res.status(200).sendFile("conf/coin_packs.json", fileOptions);
});

app.get("/api/v1/users/:id/liked_worlds", function(req, res) {
	let id = req.params["id"];
	if (!fs.existsSync("users/"+id)) {
		res.status(404);
		return;
	}
	res.status(200).sendFile("users/"+id+"/liked_worlds.json", fileOptions);
});

app.all("/api/v1/*", function(req, res) {
	res.status(404).json({
		"error": "404",
		"error_msg": "Not Found",
		"error_details": "This API endpoint has no route handler."
	});
});

// api/v2 is for modding
app.all("/api/v2/*", function(req, res) {
	res.status(404).json({
		"error": "404",
		"error_msg": "Missing or invalid API endpoint",
		"error_details": "The API endpoint is missing from the URL or is invalid."
	});
});

app.all("*", function(req, res) {
	res.set("Content-Type", "text/plain");
	res.status(403).send("Forbidden");
});

httpsServer = https.createServer(options, app);
httpsServer.listen(port);
console.log("The BW API server is ready!");
