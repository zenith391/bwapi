const session = require("express-session");
const fs = require("fs");
const bcrypt = require("bcrypt");

let conf = {}

function auth(name, pass, callback) {
	var user = conf.accounts[name];
	if (!user) {
		return callback("Could not find user");
	}
	bcrypt.compare(pass, user["hash"], function(err, res) {
		if (res) {
			callback(null, name);
		} else {
			callback("Invalid password");
		}
	});
}

function loginPath(app) {
	app.get("/webui/login", function(req, res) {
		res.locals.message = "";
		res.render("login");
	});

	app.post("/webui/login", function(req, res) {
		if (req.body.username && req.body.password) {
			auth(req.body.username, req.body.password, function(err, name) {
				if (err) {
					res.locals.message = "Could not authenticate.";
					res.render("login");
				} else {
					req.session.regenerate(function() {
						req.session.user = name;
						res.redirect("/webui/");
					});
				}
			});
		} else {
			req.session.error = "Could not authenticate.";
			res.render("login");
		}
	})
}

function home(req, res) {
	if (req.session) {
		if (req.session.user) {
			res.render("home");
		} else {
			res.redirect("/webui/login");
		}
	} else {
		res.redirect("/webui/login");
	}
}

function bc(req, res) {
	fs.readdir("worlds", function(err, files) {
		let worlds = [];
		for (i in files) {
			let world = fullWorldSync(files[i], true);
			if (world.description.match("#buildchallenge1")) {
				worlds.push(world);
			}
		}
		res.locals.worlds = worlds;
		res.render("bc");
	});
}

function stats(req, res) {
	if (req.session.user) {
		let memory = process.memoryUsage();
		res.status(200).json({
			"memory": {
				"used": memory.heapUsed,
				"total": memory.heapTotal
			}
		});
	}
}

module.exports.run = function(app) {
	app.set("view engine", "ejs");
	if (app.get("views") != ROOT_NAME + "/views") { // not default path
		console.error("Another view module is in use, cannot init WebUI");
		return;
	} else {
		app.set("views", ROOT_NAME + "/data/webui");
	}

	conf = JSON.parse(fs.readFileSync("conf/plugins/webui.json"));

	app.use("/webui/*", session({
		resave: false,
		saveUninitialized: false,
		secret: conf.secret
	}));

	app.get("/webui/", home);
	app.get("/webui/home", home);
	app.get("/webui/server_stats", stats);
	app.get("/webui/submissions", bc);

	app.get("/webui/logout", function(req, res) {
		req.session.destroy(function() {
			res.redirect("/webui/");
		})
	});

	loginPath(app);
}
