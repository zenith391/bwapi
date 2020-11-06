/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2020 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

const session = require("express-session");
const fs = require("fs");
const bcrypt = require("bcrypt");
const url = require("url");

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
	/*fs.readdir("worlds", function(err, files) {
		let worlds = [];
		for (i in files) {
			let world = fullWorldSync(files[i], true);
			if (world.description.match("#buildchallenge3")) {
				worlds.push(world);
			}
		}
		res.locals.worlds = worlds;
		res.render("bc");
	});*/
}

function newWorlds(req, res) {
	let u = url.parse(req.url, true);
	worldCache(function (err, worlds) {
		worlds = Object.values(worlds);
		worlds = worlds.map(function (world) {
			let date = new Date(world["first_published_at"]);
			if (world["first_published_at"] == undefined || isNaN(date.getTime())) {
				date = fs.statSync("worlds/" + world.id + "/metadata.json").birthtimeMs;
			} else {
				date = date.getTime();
			}
			return {
				world: world,
				time: date
			};
		}).sort(function (a, b) {
			return b.time - a.time;
		}).map(function(v) {
			return v.world;
		});

		let publishedWorlds = [];
			
		for (i in worlds) {
			let world = worlds[i];
			if (world.id < 0) { // status update world
				continue;
			}
			if (world["publication_status"] == 1) {
				publishedWorlds.push(world);
			}
		}


		let page = u.query.page;
		if (page == null || page == undefined || page < 1) {
			page = 1;
		}
		page--;
		let start = Math.min(publishedWorlds.length, 24*page);
		let end = Math.min(publishedWorlds.length, start+24);
		let totalPages = Math.ceil(publishedWorlds.length/24);
		let finalPage = [];
		for (let i=start; i < end; i++) {
			finalPage.push(publishedWorlds[i]);
		}

		res.locals.worlds = finalPage;
		res.locals.totalPages = totalPages;
		res.locals.activePage = page;
		res.render("worlds");
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

function metrics(req, res) {
	let worlds = fs.readdirSync("worlds");
	let models = fs.readdirSync("models");
	let players = fs.readdirSync("users");
	res.locals.worlds = worlds.length;
	res.locals.models = models.length;
	res.locals.players = players.length - 2; // minus user_list.js and owner_of.js
	res.render("metrics");
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
	app.get("/webui/server_metrics", metrics);
	app.get("/webui/submissions", bc);
	app.get("/webui/worlds", newWorlds);

	app.get("/webui/logout", function(req, res) {
		req.session.destroy(function() {
			res.redirect("/webui/");
		})
	});

	loginPath(app);
}
