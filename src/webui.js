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
import session from "express-session";
import fs from "fs";
import bcrypt from "bcrypt";
import url from "url";
import { User } from "./users.js";
import { loginToAccount } from "./launcher_auth.js";

let conf = {}

function loginPath(app) {
	app.get("/webui/login", function(req, res) {
		res.locals.message = "";
		res.render("login");
	});

	app.post("/webui/login", async function(req, res) {
		if (req.body.username && req.body.password) {
			try {
				const authToken = await loginToAccount(req.body.username, req.body.password);
				const userId = authTokens[authToken];
				if (conf.moderators.indexOf(userId) === undefined) {
					res.locals.message = "Not a moderator!";
					res.render("login");
				} else {
					req.session.regenerate(() => {
						req.session.user = authTokens[authToken];
						res.redirect("/webui/");
					});
				}
			} catch (e) {
				res.locals.message = e.message;
				res.render("login");
			}
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

function newWorlds(req, res) {
	let u = url.parse(req.url, true);
	worldCache(function (err, worlds) {
		worlds = Object.values(worlds);
		worlds = worlds.map(function (world) {
			let date = new Date(world["first_published_at"]);
			if (world["first_published_at"] == undefined || isNaN(date.getTime())) {
				date = 0;
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
			
		for (const i in worlds) {
			let world = worlds[i];
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
		res.locals.moderator = req.session && req.session.user;
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

async function metrics(req, res) {
	let worlds = fs.readdirSync("worlds");
	let models = fs.readdirSync("models");
	res.locals.worlds = worlds.length;
	res.locals.models = models.length;
	res.locals.players = await User.count();
	res.render("metrics");
}

export function run(app) {
	if (app.get("views") != ROOT_NAME + "/views") { // not default path
		console.error("Overriding previous view module: " + app.get("views"));
		return;
	}

	app.set("view engine", "ejs");
	app.set("views", ROOT_NAME + "/data/webui");

	if (!fs.existsSync("conf/plugins")) {
		fs.mkdirSync("conf/plugins");
	}

	if (!fs.existsSync("conf/plugins/webui.json")) {
		fs.writeFileSync("conf/plugins/webui.json", JSON.stringify({
			"secret": "change this with the cookie secret",
			"accounts": {}
		}));
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

	app.get("/webui/server_metrics/steam_active_players.csv", function(req, res) {
		res.status(200).sendFile(ROOT_NAME + "/steam_active_players.csv");
	});
	app.get("/webui/server_metrics/ios_active_players.csv", function(req, res) {
		res.status(200).sendFile(ROOT_NAME + "/ios_active_players.csv");
	});
	app.get("/webui/server_metrics/launcher_active_players.csv", function(req, res) {
		res.status(200).sendFile(ROOT_NAME + "/launcher_active_players.csv");
	});
	app.get("/webui/server_metrics/total_worlds.csv", function(req, res) {
		res.status(200).sendFile(ROOT_NAME + "/total_worlds.csv");
	});
	app.get("/webui/server_metrics/total_models.csv", function(req, res) {
		res.status(200).sendFile(ROOT_NAME + "/total_models.csv");
	});
	app.get("/webui/server_metrics/total_players.csv", function(req, res) {
		res.status(200).sendFile(ROOT_NAME + "/total_players.csv");
	});

	app.get("/webui/world/reject/:id", function(req, res) {
		const id = req.params.id;
		if (req.session && req.session.user) {
			if (fs.existsSync("worlds/" + id)) {
				let metadata = JSON.parse(fs.readFileSync("worlds/"+id+"/metadata.json", {"encoding": "utf8"}));
				metadata["publication_status"] = 2; // rejected publication status
				fs.writeFileSync("worlds/"+id+"/metadata.json", JSON.stringify(metadata));
				res.redirect("/webui/worlds");
				console.log("Rejected world " + id);
				worldCacheSet(id, metadata);
			}
		} else {
			res.redirect("/webui/login");
		}
	});

	app.get("/webui/user/ban/:id", async function(req, res) {
		const id = req.params.id;
		if (req.session && req.session.user) {
			const user = new User(id);
			if (await user.exists()) {
				await user.ban();

				res.redirect("/webui/worlds");
				console.log("Banned user " + id + " from publishing");
			}
		} else {
			res.redirect("/webui/login");
		}
	});

	app.get("/webui/worlds", newWorlds);

	app.get("/webui/logout", function(req, res) {
		req.session.destroy(function() {
			res.redirect("/webui/");
		})
	});

	loginPath(app);
}
